import {
  AIMessage,
  AIMessageChunk,
  BaseMessage,
  HumanMessage,
  ToolMessage,
} from '@langchain/core/messages';
import { Annotation, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { MessagesPlaceholder } from '@langchain/core/prompts';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { AgentState, createReactAgent, ToolNode } from '@langchain/langgraph/prebuilt';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { shouldBindTools } from '../utils/llm';
import { DynamicStructuredTool, tool } from '@langchain/core/tools';
import { z } from 'zod';
import { AskTool } from '../tools/AskTool';
import { BaseAgent } from '../../BaseAgent';
import { PlanningAgent } from '../PlanningAgent';

const createToolCallId = () => {
  // random 5 characters
  return Math.random().toString(36).substring(2, 8);
};

const StateAnnotation = Annotation.Root({
  executor_response_tools: Annotation<ToolMessage[]>,
  executor_input: Annotation<string>,
  messages: Annotation<BaseMessage[]>({
    reducer: (x, y) => x.concat(y),
  }),
  plans: Annotation<
    {
      title: string;
      tasks: { title: string; status: string; retry?: number; result?: string; index: number }[];
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
  private agent: PlanningAgent;

  constructor({
    model,
    executorPrompt,
    tools,
    agent,
  }: {
    model: BaseLanguageModel;
    executorPrompt: string;
    tools: DynamicStructuredTool[];
    agent: PlanningAgent;
  }) {
    this.model = model;
    this.executorPrompt = executorPrompt;
    this.tools = tools;
    this.agent = agent;
  }

  routeAfterAgent(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    // If no tools are called, we can finish (respond to the user)
    if (!lastMessage?.tool_calls?.length) {
      return 'end';
    }

    if (lastMessage?.tool_calls?.length && lastMessage?.tool_calls[0]?.name === 'terminate') {
      return 'executor_terminate';
    }

    if (lastMessage?.tool_calls?.length && lastMessage?.tool_calls[0]?.name === 'ask_user') {
      return 'ask_user';
    }
    // Otherwise if there are tool calls, we continue to execute them
    return 'executor_tools';
  }

  async executorAgentNode(state: typeof StateAnnotation.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.executorPrompt],
      ['human', '{input}'],
      new MessagesPlaceholder('messages'),
    ]);

    // Check if there are any messages in the state to determine if we need to call the terminate tool with a reason or not
    const terminateTool =
      state.messages?.length > 0
        ? tool(
            async (input: {}) => {
              return 'finished';
            },
            {
              name: 'terminate',
              description: 'Call you want to finish the task',
              schema: z.object({}),
            },
          )
        : tool(
            async (input: {}) => {
              return 'finished';
            },
            {
              name: 'terminate',
              description: 'Call you want to finish the task',
              schema: z.object({
                reason: z.string().optional().describe('Reason for calling terminate tool'),
              }),
            },
          );

    const askTool = new AskTool();
    const wrappedAskTool = this.agent.addTool2CallbackManager(askTool);

    let modelWithTools;
    if (shouldBindTools(this.model, this.tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      modelWithTools = this.model.bind({
        tools: [...this.tools, terminateTool, wrappedAskTool].map(t => convertToOpenAITool(t)),
        tool_choice: 'required',
      } as any);
    } else {
      modelWithTools = this.model;
    }

    const agent = prompt.pipe(modelWithTools);

    const responseMessage = await agent.invoke({
      input: state.executor_input,
      messages: [...(state.messages ?? [])],
    });

    return { messages: [responseMessage] };
  }

  getExecutorResponseTools(messages: BaseMessage[]) {
    const responseTools = messages
      ?.filter((m: BaseMessage) => m.constructor.name == 'ToolMessage')
      .map((item: BaseMessage) => {
        const toolMessage = item as ToolMessage;
        if (toolMessage.name === 'ask_user') {
          const askUserMessage = messages.find((m: any) => {
            return m.tool_calls?.[0]?.id === toolMessage.tool_call_id;
          }) as AIMessage;
          if (askUserMessage) {
            return {
              ...item,
              tool_call_id: createToolCallId(),
              content:
                'You asked user: ' +
                askUserMessage?.tool_calls?.[0]?.args?.question +
                '\nUser response: ' +
                item.content,
            };
          }
        }
        return { ...item, tool_call_id: createToolCallId() };
      });
    return responseTools;
  }

  async executorTerminateNode(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    return {
      executor_response_tools: [
        ...this.getExecutorResponseTools(state.messages),
        new ToolMessage({
          tool_call_id: createToolCallId(),
          name: 'executor',
          content: lastMessage.tool_calls?.[0]?.args?.reason ?? '',
        }),
      ],
    };
  }

  async askNode(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;
    this.agent.setAskUser(true);
    const userMessage = interrupt({
      question: lastMessage.tool_calls?.[0]?.args?.question ?? '',
    });
    this.agent.setAskUser(false);
    const createToolCallId = () => {
      // random 5 characters
      return Math.random().toString(36).substring(2, 8);
    };
    const toolCallId = lastMessage.tool_calls?.[0].id ?? createToolCallId();
    return {
      messages: [
        // ...(state.messages ?? []),
        new ToolMessage({
          content: userMessage.input,
          tool_call_id: toolCallId,
          name: lastMessage.tool_calls?.[0]?.name,
        }),
      ],
    };
  }

  create() {
    const executorGraph = new StateGraph(StateAnnotation)
      .addNode('executor_agent', this.executorAgentNode.bind(this))
      .addNode('executor_tools', new ToolNode(this.tools))
      .addNode('executor_terminate', this.executorTerminateNode.bind(this))
      .addNode('ask_user', this.askNode.bind(this))
      .addNode('end', () => {
        return {};
      })
      .addEdge(START, 'executor_agent')
      .addConditionalEdges('executor_agent', this.routeAfterAgent, {
        end: 'end',
        ask_user: 'ask_user',
        executor_tools: 'executor_tools',
        executor_terminate: 'executor_terminate',
      })
      .addEdge('ask_user', 'executor_agent')
      .addEdge('executor_tools', 'executor_agent')
      .addEdge('executor_terminate', 'end')
      .addEdge('end', END);

    return executorGraph.compile();
  }
}
