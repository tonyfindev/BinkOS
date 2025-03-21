import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { BaseMessage, HumanMessage, AIMessage, ToolMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { IWallet } from '../../wallet/types';
import { NetworkName, NetworksConfig } from '../../network/types';
import { AgentConfig, AgentContext, AgentExecuteParams, AgentNodeTypes, IAgent } from '../types';
import { CreatePlanTool, GetWalletAddressTool, ITool, UpdatePlanTool } from '../tools';
import { Agent } from '../Agent';
import { IPlugin } from '../../plugin/types';
import { DatabaseAdapter } from '../../storage';
import { MessageEntity } from '../../types';
import { EVM_NATIVE_TOKEN_ADDRESS, SOL_NATIVE_TOKEN_ADDRESS } from '../../network';
import { CallbackManager, IToolExecutionCallback } from '../callbacks';
import {
  Command,
  CompiledStateGraph,
  END,
  getCurrentTaskInput,
  InMemoryStore,
  LangGraphRunnableConfig,
  START,
} from '@langchain/langgraph';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { PlannerGraph } from './graph/PlannerGraph';
import { ExecutorGraph } from './graph/ExecutorGraph';
import { MemorySaver } from '@langchain/langgraph';
import { createPlanTool } from './tools/CreatePlanTool';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { shouldBindTools } from './utils/llm';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { BasicQuestionGraph } from './graph/BasicQuestionGraph';
const StateAnnotation = Annotation.Root({
  executor_input: Annotation<string>,

  active_plan_id: Annotation<string>,
  selected_task_indexes: Annotation<number[]>,
  next_node: Annotation<string>,
  executor_response_tools: Annotation<ToolMessage[]>,
  plans: Annotation<
    {
      title: string;
      tasks: { title: string; status: string; retry?: number; result?: string; index: number }[];
      id: string;
      status: string;
    }[]
  >,
  chat_history: Annotation<BaseMessage[]>,
  input: Annotation<string>,
  answer: Annotation<string>,
});

export class PlanningAgent extends Agent {
  private workflow!: StateGraph<any, any, any, any, any, any, any>;
  public graph!: CompiledStateGraph<any, any, any, any, any, any>;

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    super(config, wallet, networks);
  }

  protected getDefaultTools(): ITool[] {
    return [];
  }

  async supervisorNode(state: typeof StateAnnotation.State) {
    const supervisorPrompt = `You are a supervisor. You need to decide if the user's request is a blockchain execution or other. 
NOTE: 
- Blockchain execution: Execute a transaction on blockchain like transfer, swap, bridge, lending, staking, cross-chain
- Other: Other request like checking balance, checking transaction, etc.`;
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', supervisorPrompt],
      new MessagesPlaceholder('chat_history'),
      ['human', `User's request: {input}`],
    ]);

    const routerTool = tool(
      async ({ next }: { next: string }) => {
        if (next === 'other') {
          return {
            next: 'other',
          };
        } else {
          return {
            next: 'execution',
          };
        }
      },
      {
        name: 'router',
        description:
          "Use this tool to decide if the user's request is a blockchain execution or other.",
        schema: z.object({
          next: z.enum(['other', 'execution']),
        }),
      },
    );

    const tools = [routerTool];
    let modelWithTools;
    if (shouldBindTools(this.model, tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      console.log('binding tools');
      modelWithTools = this.model.bindTools(tools, {
        tool_choice: 'required',
      });
    } else {
      modelWithTools = this.model;
    }

    const planAgent = prompt.pipe(modelWithTools);

    const response = (await planAgent.invoke({
      input: state.input,
      chat_history: state.chat_history || [],
    })) as any;

    if (response?.tool_calls) {
      const toolCall = response.tool_calls[0];
      const toolName = toolCall.name;
      const toolArgs = toolCall.args;
      const tool = tools.find(t => t.name === toolName);
      const result = await tool?.invoke(toolArgs);
      return {
        next_node: result.next,
      };
    }
    return response;
  }

  protected getRetrievalTools() {
    const toolNames = ['get_wallet_balance', 'get_token_info', 'knowledge'];
    return this.getTools().filter(t => toolNames.includes(t.name));
  }

  async executorAnswerNode(state: typeof StateAnnotation.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.config.systemPrompt || ''],
      new MessagesPlaceholder('chat_history'),
      ['human', `{input}`],
      ['human', 'plans: {plans}'],
      ['system', 'You need to response user after execute the plan'],
    ]);

    const response = await prompt.pipe(this.model).invoke({
      input: state.input,
      plans: JSON.stringify(state.plans),
      chat_history: state.chat_history || [],
    });

    return { answer: response.content };
  }

  protected async createExecutor(): Promise<CompiledStateGraph<any, any, any, any, any, any>> {
    const executorTools = this.getTools();

    const executorPrompt = `You are blockchain executor. Your goal is to execute the following steps.`;
    const defaultPlanPrompt = `NOTE: 
- You must get balance to get any token (must include token symbol and token address) in wallet
- You need token address when execute on-chain transaction
- You can create multiple plans to execute the user's request.
- If a task is failed many times, you update a new task to execute the plan`;

    const createPlanPrompt =
      `You are blockchain planner. Your goal is create plans to execute the user's request. \n` +
      defaultPlanPrompt;

    const updatePlanPrompt =
      `You are a blockchain planner. Your goal is to update the current plans based on the active plan and selected tasks. \n. When a task is failed, you need to update task title\n` +
      defaultPlanPrompt;

    let toolsStr = '';
    for (const tool of executorTools) {
      const toolJson = convertToOpenAITool(tool);
      toolsStr += `${JSON.stringify({ name: toolJson.function.name })}\n`;
    }

    const executorGraph = new ExecutorGraph({
      model: this.model,
      executorPrompt,
      tools: executorTools,
    }).create();

    const plannerGraph = new PlannerGraph({
      model: this.model,
      createPlanPrompt: createPlanPrompt,
      updatePlanPrompt: updatePlanPrompt,
      activeTasksPrompt: '',
      listToolsPrompt: toolsStr,
    }).create();

    const basicQuestionGraph = new BasicQuestionGraph({
      model: this.model,
      prompt: this.config.systemPrompt || '',
      tools: this.getRetrievalTools(),
    }).create();

    this.workflow = new StateGraph(StateAnnotation)
      .addNode('supervisor', this.supervisorNode.bind(this))
      .addNode('basic_question', basicQuestionGraph)
      .addNode('executor_answer', this.executorAnswerNode.bind(this))
      .addNode('planner', plannerGraph)
      .addNode('executor', executorGraph)
      .addEdge(START, 'supervisor')
      .addConditionalEdges(
        'supervisor',
        state => {
          if (state.next_node === 'other') {
            return 'basic_question';
          } else {
            return 'planner';
          }
        },
        {
          basic_question: 'basic_question',
          planner: 'planner',
        },
      )
      .addConditionalEdges(
        'planner',
        state => {
          if (state.next_node === END) {
            return 'executor_answer';
          } else {
            return 'executor';
          }
        },
        {
          executor: 'executor',
          executor_answer: 'executor_answer',
        },
      )
      .addEdge('executor', 'planner')
      .addEdge('basic_question', END)
      .addEdge('executor_answer', END);

    // const checkpointer = new MemorySaver();

    this.graph = await this.workflow.compile();

    return this.graph;
  }

  async execute(commandOrParams: string | AgentExecuteParams): Promise<any> {
    if (typeof commandOrParams === 'string') {
      const result = await this.graph.invoke({ input: commandOrParams, chat_history: [] });
      return result.answer;
    } else {
      const result = await this.graph.invoke({
        ...commandOrParams,
        chat_history: commandOrParams?.history ?? [],
      } as any);
      return result.answer;
    }
  }
}
