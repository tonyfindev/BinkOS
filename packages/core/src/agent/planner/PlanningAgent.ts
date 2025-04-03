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
  MemorySaver,
  START,
} from '@langchain/langgraph';
import { Annotation, StateGraph } from '@langchain/langgraph';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { PlannerGraph } from './graph/PlannerGraph';
import { ExecutorGraph } from './graph/ExecutorGraph';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { cleanToolParameters, shouldBindTools } from './utils/llm';
import { BasicQuestionGraph } from './graph/BasicQuestionGraph';
import { threadId } from 'worker_threads';

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
  private workflow!: StateGraph<any, any, any, any, any, any>;
  public graph!: CompiledStateGraph<any, any, any, any, any, any>;
  private isAskUser = false;
  private askUserTimeout: NodeJS.Timeout | null = null;

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    super(config, wallet, networks);
  }

  protected getDefaultTools(): ITool[] {
    return [];
  }

  public async setAskUser(isAskUser: boolean) {
    this.isAskUser = isAskUser;
    if (isAskUser) {
      this.askUserTimeout = setTimeout(() => {
        this.isAskUser = false;
      }, 60 * 1000);
    } else {
      if (this.askUserTimeout) {
        clearTimeout(this.askUserTimeout);
        this.askUserTimeout = null;
      }
    }
  }

  async supervisorNode(state: typeof StateAnnotation.State) {
    const supervisorPrompt = `You are a supervisor. You need to decide if the user's request is a blockchain execution or other. 
NOTE: 
- Blockchain execution: Execute a transaction on blockchain like transfer, swap, bridge, lending, staking, cross-chain
- Other: Other request like checking balance, checking transaction, etc.`;
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', supervisorPrompt],
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

  protected async createExecutor(): Promise<CompiledStateGraph<any, any, any, any, any, any>> {
    const executorTools = this.getTools();

    const defaultPlanPrompt = `NOTE: 
      - Create task ask user to provide more information
      - Retrieve information in user's request and maintain it each task
      - You must get balance to get any token (must include token symbol and token address) in wallet
      - You need token address when execute on-chain transaction
      - You can create multiple plans to execute the user's request.
      - If a task is failed many times, you update a new task to execute the plan`;

    const executorPrompt =
      `You are blockchain executor. Your goal is to execute the following steps. 
      NOTE:
      - Never call a tool more than once` + defaultPlanPrompt;

    const createPlanPrompt =
      `You are blockchain planner. Your goal is create plans to execute the user's request. \n` +
      defaultPlanPrompt;

    const updatePlanPrompt =
      `You are a blockchain planner. Your goal is to update the current plans based on the active plan and selected tasks. \n. When a task is failed, you need to update task title\n` +
      defaultPlanPrompt;

    let toolsStr = '';

    for (const tool of executorTools) {
      const toolJson = convertToOpenAITool(tool);
      // Apply the cleanToolParameters function to clean the parameters
      if (toolJson.function.parameters) {
        toolJson.function.parameters = cleanToolParameters(toolJson.function.parameters);
      }
      toolsStr += `${JSON.stringify({ name: toolJson.function.name, params: toolJson.function.parameters })}\n`;
    }

    const executorGraph = new ExecutorGraph({
      model: this.model,
      executorPrompt,
      tools: executorTools,
      agent: this,
    }).create();

    const plannerGraph = new PlannerGraph({
      model: this.model,
      createPlanPrompt: createPlanPrompt,
      updatePlanPrompt: updatePlanPrompt,
      activeTasksPrompt: '',
      answerPrompt: this.config.systemPrompt || '',
      listToolsPrompt: toolsStr,
      agent: this,
    }).create();

    const basicQuestionGraph = new BasicQuestionGraph({
      model: this.model,
      prompt: this.config.systemPrompt || '',
      tools: this.getRetrievalTools(),
    }).create();

    this.workflow = new StateGraph(StateAnnotation)
      .addNode('supervisor', this.supervisorNode.bind(this))
      .addNode('basic_question', basicQuestionGraph)
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
          if (state.next_node === END && state.answer != null) {
            return END;
          } else {
            return 'executor';
          }
        },
        {
          executor: 'executor',
          __end__: END,
        },
      )
      .addEdge('executor', 'planner')
      .addEdge('basic_question', END);

    const checkpointer = new MemorySaver();

    this.graph = await this.workflow.compile({ checkpointer });

    return this.graph;
  }

  // Implementing the message persistence and history logic in the execute method
  async execute(
    commandOrParams: string | AgentExecuteParams,
    onStream?: (data: string) => void,
  ): Promise<any> {
    if (typeof commandOrParams === 'string') {
      commandOrParams = {
        input: commandOrParams,
        threadId: uuidv4(),
      };
    }

    if (this.isAskUser && typeof commandOrParams !== 'string') {
      let result = '';
      if (onStream) {
        const eventStream = await this.graph.streamEvents(
          { resume: { input: commandOrParams.input } },
          {
            version: 'v2',
            configurable: {
              thread_id: commandOrParams.threadId,
            },
          },
        );

        for await (const { event, tags, data } of eventStream) {
          if (event === 'on_chat_model_stream' && tags?.includes('final_node')) {
            if (data.chunk.content) {
              // Empty content in the context of OpenAI or Anthropic usually means
              // that the model is asking for a tool to be invoked.
              // So we only print non-empty content
              console.log(data.chunk.content, '|');
              result += data.chunk.content;
              onStream(data.chunk.content);
            }
          }
        }
      } else {
        result = (
          await this.graph.invoke(
            { resume: { input: commandOrParams.input } },
            {
              configurable: {
                thread_id: commandOrParams.threadId,
              },
            },
          )
        ).answer;
      }
      try {
        const threadId =
          typeof commandOrParams === 'string' ? undefined : commandOrParams?.threadId;
        await this.db?.createMessage(
          { content: result, user_id: this.context?.user?.id, message_type: 'ai' },
          threadId,
        );
      } catch (e) {
        console.error('Error persisting message:', e);
      }

      return result;
    }
    let _history: MessageEntity[] = [];

    // Ensure database is initialized before accessing
    if (this.db) {
      if (typeof commandOrParams === 'string') {
        if (this.context?.user?.id) {
          _history = await this.db.getMessagesByUserId(this.context.user.id);
        } else {
          console.warn('User ID is undefined, skipping history retrieval.');
        }
      } else {
        if (commandOrParams?.threadId) {
          _history = await this.db.getMessagesByThreadId(commandOrParams.threadId);
        } else {
          console.warn('Thread ID is undefined, skipping history retrieval.');
        }
      }
    } else {
      console.error('Database not initialized.');
    }

    const history = _history.map((message: MessageEntity) =>
      message?.message_type === 'human'
        ? new HumanMessage(message?.content)
        : new AIMessage(message?.content),
    );

    const input = typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input;
    const chat_history = history;

    let response = '';
    if (onStream) {
      const eventStream = await this.graph.streamEvents(
        { input, chat_history },
        {
          version: 'v2',
          configurable: {
            thread_id: commandOrParams.threadId,
          },
        },
      );

      for await (const { event, tags, data } of eventStream) {
        if (event === 'on_chat_model_stream' && tags?.includes('final_node')) {
          if (data.chunk.content) {
            // Empty content in the context of OpenAI or Anthropic usually means
            // that the model is asking for a tool to be invoked.
            // So we only print non-empty content
            console.log(data.chunk.content, '|');
            response += data.chunk.content;
            onStream(data.chunk.content);
          }
        }
      }
    } else {
      response = (
        await this.graph.invoke(
          { input, chat_history },
          {
            configurable: {
              thread_id: commandOrParams.threadId,
            },
          },
        )
      ).answer;
    }

    try {
      const threadId = typeof commandOrParams === 'string' ? undefined : commandOrParams?.threadId;

      // Persist human message
      await this.db?.createMessage(
        { content: input, user_id: this.context?.user?.id, message_type: 'human' },
        threadId,
      );

      // Persist AI message
      if (response) {
        await this.db?.createMessage(
          { content: response, user_id: this.context?.user?.id, message_type: 'ai' },
          threadId,
        );
      }

      console.log('Messages persisted successfully');
    } catch (dbError) {
      console.error('Error persisting message:', dbError);
    }

    return response;
  }
}
function uuidv4(): `${string}-${string}-${string}-${string}-${string}` | undefined {
  throw new Error('Function not implemented.');
}
