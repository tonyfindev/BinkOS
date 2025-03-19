import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
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
import { FinishTool } from '../tools/FinishTool';
import { JsonOutputToolsParser } from 'langchain/output_parsers';
import { v4 as uuidv4 } from 'uuid';
import { log } from 'console';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { DynamicStructuredTool, StructuredTool, tool, Tool } from '@langchain/core/tools';
import { z } from 'zod';
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { RunnableConfig } from '@langchain/core/runnables';
import { PlannerGraph } from './graph/PlannerGraph';
import { ExecutorGraph } from './graph/ExecutorGraph';

const StateAnnotation = Annotation.Root({
  planner_messages: Annotation<BaseMessage[]>,
  executor_messages: Annotation<BaseMessage[]>,
  executor_input: Annotation<string>,

  active_plan_id: Annotation<string>,
  selected_task_indexes: Annotation<number[]>,
  next_node: Annotation<string>,
  plans: Annotation<
    {
      title: string;
      tasks: { title: string; status: string; retry?: number; result?: string }[];
      id: string;
      status: string;
    }[]
  >({
    reducer: (x, y) => y,
  }),

  input: Annotation<string>,
});

export class PlanningAgent extends Agent {
  private workflow!: StateGraph<any, any, any, any, any, any, any>;
  public graph!: CompiledStateGraph<any, any, any, any, any, any>;

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    super(config, wallet, networks);
  }

  protected async createExecutor(): Promise<CompiledStateGraph<any, any, any, any, any, any>> {
    const executorTools = this.getToolsByNode(AgentNodeTypes.EXECUTOR);

    const executorPrompt = `You are blockchain executor. Your goal is to execute the user's request`;
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

    const tools = this.getToolsByNode(AgentNodeTypes.EXECUTOR);

    let toolsStr = '';
    for (const tool of tools) {
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

    this.workflow = new StateGraph(StateAnnotation)
      .addNode('planner', plannerGraph)
      .addNode('executor', executorGraph)
      .addEdge(START, 'planner')
      .addConditionalEdges('planner', state => {
        if (state.next_node === END) {
          return END;
        } else {
          return 'executor';
        }
      })
      .addEdge('executor', 'planner');

    this.graph = await this.workflow.compile();

    return this.graph;
  }

  async execute(commandOrParams: string | AgentExecuteParams): Promise<any> {
    if (typeof commandOrParams === 'string') {
      return this.graph.invoke({ messages: [new HumanMessage(commandOrParams)] });
    }
    return null;
  }
}
