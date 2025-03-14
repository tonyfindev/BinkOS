import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { IWallet } from '../wallet/types';
import { NetworkName, NetworksConfig } from '../network/types';
import { AgentConfig, AgentContext, AgentExecuteParams, AgentNodeTypes, IAgent } from './types';
import { GetWalletAddressTool, ITool, PlanningTool } from './tools';
import { Agent } from './Agent';
import { IPlugin } from '../plugin/types';
import { DatabaseAdapter } from '../storage';
import { MessageEntity } from '../types';
import { EVM_NATIVE_TOKEN_ADDRESS, SOL_NATIVE_TOKEN_ADDRESS } from '../network';
import { CallbackManager, IToolExecutionCallback } from './callbacks';
import {
  CompiledStateGraph,
  END,
  getCurrentTaskInput,
  InMemoryStore,
  LangGraphRunnableConfig,
  START,
} from '@langchain/langgraph';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { FinishTool } from './tools/FinishTool';
import { JsonOutputToolsParser } from 'langchain/output_parsers';
import { v4 as uuidv4 } from 'uuid';
import { log } from 'console';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool, StructuredTool, tool, Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { RunnableConfig } from '@langchain/core/runnables';

const StateAnnotation = Annotation.Root({
  input: Annotation<string>({
    reducer: (x, y) => y,
  }),
  next_input: Annotation<string>({
    reducer: (x, y) => y,
  }),
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  messages2: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  chat_history: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  plans: Annotation<
    { title: string; tasks: { title: string; status: string }[]; id: string; status: string }[]
  >({
    reducer: (x, y) => y,
  }),
  next_node: Annotation<string>({
    reducer: (x, y) => y,
  }),
  tokens: Annotation<
    {
      address: string;
      amount: string;
      symbol: string;
      decimals: number;
      network: NetworkName;
      my_balance?: string;
    }[]
  >({
    //group by address and network
    reducer: (x, y) => {
      let acc: Record<
        string,
        {
          address: string;
          amount: string;
          symbol: string;
          decimals: number;
          network: NetworkName;
          my_balance?: string;
        }
      > = {};
      const grouped = x.reduce((acc: any, token) => {
        const key = `${token.address}-${token.network}`;
        acc[key] = token;
        return acc;
      }, {});
      return Object.values(grouped);
    },
  }),
});

type AgentState = typeof StateAnnotation.State;

export class PlanningAgent extends Agent {
  private workflow!: StateGraph<any, any, any, any, any, any, any>;
  public graph!: CompiledStateGraph<any, any, any, any, any, any>;

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    super(config, wallet, networks);
  }

  protected async createPlannerNode(state: AgentState) {
    const systemPrompt = `You are blockchain planner. Your goal is to plan the best way to execute the user's request. Response the user with the plan and the tools to execute the plan with MARKDOWN.`;

    const tools = this.getToolsByNode(AgentNodeTypes.PLANNER);

    let toolsStr = '';
    for (const tool of tools) {
      // console.log(convertToOpenAITool(tool))
      const toolJson = convertToOpenAITool(tool);
      toolsStr += `${JSON.stringify({ name: toolJson.function.name, description: toolJson.function.description })}\n`;
    }

    let prompt: ChatPromptTemplate;
    if (state?.plans?.length > 0) {
      prompt = ChatPromptTemplate.fromMessages([
        ['system', (this.config.systemPrompt || systemPrompt) + `\n\nList tools:\n\n{toolsStr}`],
        ['human', 'The current plans: {plan}'],
        ['human', `Plan to execute the user's request: {input}`],
        new MessagesPlaceholder('chat_history'),
        ['system', `Update current plans if needed.`],
      ]);
    } else {
      prompt = ChatPromptTemplate.fromMessages([
        ['system', (this.config.systemPrompt || systemPrompt) + `\n\nList tools:\n\n{toolsStr}`],
        ['human', `Plan to execute the user's request: {input}`],
      ]);
    }
    const planningTool = new PlanningTool({});
    const finishTool = new FinishTool({});

    const tools2 = [planningTool.createTool(), finishTool.createTool()];
    const boundModel = this.model.bind({
      tools: tools2.map(tool => convertToOpenAITool(tool)),
      tool_choice: 'required',
    });

    const toolsByName = tools2.reduce((acc: Record<string, any>, tool: any) => {
      acc[tool.name] = tool;
      return acc;
    }, {});

    const agentExecutor = prompt
      .pipe(boundModel)
      .pipe(new JsonOutputToolsParser())
      .pipe(async x => {
        const tool = toolsByName[x[0].type.toLowerCase()];
        return {
          tool: x[0],
          tool_response: await tool.invoke(x[0].args),
        };
      });

    // const agent = await createOpenAIToolsAgent({
    //   llm: this.model,
    //   tools: [planningTool.createTool(), finishTool.createTool()],
    //   prompt,
    // });

    // const agentExecutor = await AgentExecutor.fromAgentAndTools({
    //   agent,
    //   tools: [planningTool.createTool(), finishTool.createTool()],
    // });

    const result = await agentExecutor.invoke({
      input: state.input,
      chat_history: state.messages2 ?? [],
      toolsStr: toolsStr,
      plan: JSON.stringify(state.plans),
    });

    //create a tool

    // const plans: {title: string, tasks: {title: string, status: string}[], id: string, status: string}[] = [];
    if (result.tool_response) {
      let plans = JSON.parse(result.tool_response) as {
        title: string;
        tasks: { title: string; status: string }[];
        plan_id: string;
        status: string;
      }[];

      const selectTasksTool = tool(
        async (
          input: { plan_id: string; task_indexes: number[] },
          config?: LangGraphRunnableConfig,
        ) => {
          // console.log('🤖 Select tasks tool config:', config?.store);

          // const userId = config?.configurable?.userId;
          // const plans = await config?.store?.get([userId, "plans"], "plans") as unknown as {title: string, tasks: {title: string, status: string}[], id: string, status: string}[];
          console.log('🤖 Plans:', plans);
          const plan = plans?.find(plan => plan.plan_id === input.plan_id);
          if (!plan) {
            throw new Error('Plan not found');
          }
          const tasks = plan.tasks.filter((task, index) => input.task_indexes.includes(index));
          //get task done
          const taskDone = plan.tasks.filter(task => task.status === 'completed');
          let content = `
        I need to execute the following steps:
  
        ${tasks.map(task => `- ${task.title} => ${task.status}`).join('\n')}`;

          if (taskDone.length > 0) {
            content += `\n\nThe steps done are: ${taskDone.map(task => `"${task.title}"`).join(', ')}`;
          }

          return content;
        },
        {
          name: 'select_tasks',
          description: 'Select the tasks',
          schema: z.object({
            plan_id: z.string().describe('The id of the plan'),
            task_indexes: z
              .array(z.number())
              .describe('The indexes of the tasks to executor need handle'),
          }),
        },
      );

      const terminateTool = tool(
        async (input: {}) => {
          return { status: 'finished' };
        },
        {
          name: 'terminate',
          description: 'Call when the plan is finished',
          schema: z.object({}),
        },
      );

      const tools3 = [selectTasksTool, terminateTool];

      const tool3ByName = tools3.reduce((acc: Record<string, any>, tool: any) => {
        acc[tool.name] = tool;
        return acc;
      }, {});

      const nextPrompt = ChatPromptTemplate.fromMessages([
        [
          'system',
          `Based on the plan, Select the tasks to executor need handle, You can select multiple tasks`,
        ],
        ['human', `The current plan: {plan}`],
      ]);
      const nextResult = await nextPrompt
        .pipe(
          this.model.bind({
            tools: tools3.map(tool => convertToOpenAITool(tool)),
            tool_choice: 'required',
          }),
        )
        .pipe(new JsonOutputToolsParser())
        .pipe(async x => {
          const tool = tool3ByName[x[0].type.toLowerCase()];
          return {
            content: await tool.invoke(x[0].args),
          };
        })
        .invoke({ plan: JSON.stringify(plans), input: state.input, plans: result.tool_response });
      return { plans, next_input: nextResult.content };
    }

    return { next_node: END };
  }

  protected async createExecutorNode(state: AgentState) {
    const systemPrompt = `You are blockchain executor. Your goal is to execute the user's request`;

    const tools = this.getToolsByNode(AgentNodeTypes.EXECUTOR);

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', systemPrompt],
      // ['human', 'Here is the plan: {plan}'],
      ['human', '{input}'],
      new MessagesPlaceholder('chat_history'),
      // ['human', 'Here is the tokens info and my balance: {tokens}'],
      // new MessagesPlaceholder('agent_scratchpad'),
    ]);

    // const agent = await createOpenAIToolsAgent({
    //   llm: this.model,
    //   tools ,
    //   prompt,
    // });

    // const agentExecutor = await AgentExecutor.fromAgentAndTools({
    //   agent,
    //   tools,
    // });

    // const result = await agentExecutor.invoke({input: state.next_input, chat_history: state.messages ?? [], plan: JSON.stringify(state.plans), tokens: JSON.stringify(state.tokens)});

    // console.log('🤖 Executor result 2:', result);

    // console.log('🤖 Executor state:', state);

    const boundModel = this.model.bind({
      tools: tools.map(tool => convertToOpenAITool(tool)),
    });
    const responseMessage = await prompt
      .pipe(boundModel)
      .invoke({
        input: state.next_input,
        chat_history: [...(state.messages2 ?? []), ...(state.messages ?? [])],
        plan: JSON.stringify(state.plans),
        tokens: JSON.stringify(state.tokens || []),
      });
    return { messages: [responseMessage] };

    // return {messages: [new AIMessage(result.output)]};
  }

  protected async createExecutor(): Promise<CompiledStateGraph<any, any, any, any, any, any>> {
    const tools = this.getToolsByNode(AgentNodeTypes.EXECUTOR);

    // const callModel = async (state: AgentState) => {
    //   try {
    //     const boundModel = this.model.bindTools(tools);
    //     const responseMessage = await boundModel.invoke(state.messages);
    //     return { messages: [responseMessage] };
    //   } catch (error) {
    //     throw error;
    //   }
    // };

    const routeAfterAgent = (state: AgentState) => {
      const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

      // If no tools are called, we can finish (respond to the user)
      if (!lastMessage?.tool_calls?.length) {
        return END;
      }
      // Otherwise if there are tool calls, we continue to execute them
      return 'tools';
    };

    const executorGraph = new StateGraph(StateAnnotation)
      .addNode('agent', this.createExecutorNode.bind(this))
      .addNode('tools', new ToolNode(tools))
      .addEdge(START, 'agent')
      .addConditionalEdges('agent', routeAfterAgent, {
        __end__: END,
        tools: 'tools',
      })
      .addEdge('tools', 'agent');

    const compiledExecutorGraph = await executorGraph.compile();

    async function executeExecutorGraph(state: AgentState) {
      const result = await compiledExecutorGraph.invoke(state);
      return { messages2: [result.messages[result.messages.length - 1] as AIMessage] };
    }

    this.workflow = new StateGraph(StateAnnotation)
      .addNode('planner', this.createPlannerNode.bind(this))
      .addNode('executor', executeExecutorGraph)
      .addEdge(START, 'planner')
      .addConditionalEdges('planner', state => {
        if (state.next_node === END) {
          return END;
        } else {
          return 'executor';
        }
      })
      .addEdge('executor', 'planner');

    const store = new InMemoryStore();

    this.graph = await this.workflow.compile({ store });
    return this.graph;
  }

  async execute(commandOrParams: string | AgentExecuteParams): Promise<any> {
    if (typeof commandOrParams === 'string') {
      return this.graph.invoke({ messages: [new HumanMessage(commandOrParams)] });
    }
    return null;
  }
}
