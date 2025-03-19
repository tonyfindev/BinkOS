import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { NetworkName } from '../../..';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { MessagesPlaceholder } from '@langchain/core/prompts';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentState, createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { createPlanTool } from '../tools/CreatePlanTool';
import { shouldBindTools } from '../utils/llm';
import { selectTasksTool } from '../tools/SelectTasksTool';
import { terminateTool } from '../tools/TerminateTool';
import { updatePlanTool } from '../tools/UpdatePlanTool';
import { DynamicStructuredTool } from '@langchain/core/tools';

const StateAnnotation = Annotation.Root({
  planner_messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  executor_messages: Annotation<BaseMessage[]>,
  executor_input: Annotation<string>,

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
    {
      title: string;
      tasks: { title: string; status: string; retry?: number; result?: string }[];
      id: string;
      status: string;
    }[]
  >,
  active_plan_id: Annotation<string>,
  selected_task_indexes: Annotation<number[]>,
  next_node: Annotation<string>,
});

export class ExecutorGraph {
  private model: BaseLanguageModel;
  private executorPrompt: string;
  private tools: DynamicStructuredTool[];

  constructor({
    model,
    executorPrompt,
    tools,
  }: {
    model: BaseLanguageModel;
    executorPrompt: string;
    tools: DynamicStructuredTool[];
  }) {
    this.model = model;
    this.executorPrompt = executorPrompt;
    this.tools = tools;
  }

  routeAfterAgent(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    // If no tools are called, we can finish (respond to the user)
    if (!lastMessage?.tool_calls?.length) {
      return END;
    }
    // Otherwise if there are tool calls, we continue to execute them
    return 'executor_tools';
  }

  async executorAgentNode(state: typeof StateAnnotation.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.executorPrompt],
      // ['human', 'Here is the plan: {plan}'],
      // new MessagesPlaceholder('planner_messages'),
      ['human', '{input}'],
      new MessagesPlaceholder('messages'),
      // ['human', 'Here is the tokens info and my balance: {tokens}'],
      // new MessagesPlaceholder('agent_scratchpad'),
    ]);

    let modelWithTools;
    if (shouldBindTools(this.model, this.tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      modelWithTools = this.model.bind({
        tools: this.tools.map(t => convertToOpenAITool(t)),
      } as any);
    } else {
      modelWithTools = this.model;
    }

    const agent = prompt.pipe(modelWithTools);

    const plannerMessages = (state.planner_messages ?? []).map(
      (m: BaseMessage) => new HumanMessage(m?.content?.toString() ?? ''),
    );

    const responseMessage = await agent.invoke({
      input: state.executor_input,
      planner_messages: plannerMessages,
      messages: [...(state.messages ?? [])],
    });

    if (!responseMessage.tool_calls?.length) {
      const toolMessages = state.messages
        ?.filter((m: BaseMessage) => m instanceof ToolMessage)
        .map((m: ToolMessage) => {
          return new HumanMessage(`${m.name} ${JSON.stringify(m.content)}`);
        });

      return {
        messages: [responseMessage],
        planner_messages: [responseMessage],
        executor_messages: toolMessages,
      };
    }

    return { messages: [responseMessage] };
  }

  create() {
    console.log('🤖 Create executor graph', this.tools);
    const executorGraph = new StateGraph(StateAnnotation)
      .addNode('executor_agent', this.executorAgentNode.bind(this))
      .addNode('executor_tools', new ToolNode(this.tools))
      .addEdge(START, 'executor_agent')
      .addConditionalEdges('executor_agent', this.routeAfterAgent, {
        __end__: END,
        executor_tools: 'executor_tools',
      })
      .addEdge('executor_tools', 'executor_agent');

    return executorGraph.compile();
  }
}
