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

const createToolCallId = () => {
  // random 5 characters
  return Math.random().toString(36).substring(2, 8);
};

const StateAnnotation = Annotation.Root({
  executor_response_tools: Annotation<ToolMessage[]>,
  executor_input: Annotation<string>,
  executor_messages: Annotation<string>,
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
  resumed_from_interrupt: Annotation<boolean>,
});

export class ExecutorGraph {
  private model: BaseLanguageModel;
  private executorPrompt: string;
  private tools: DynamicStructuredTool[];
  private agent: BaseAgent;

  // Create a persistent tool counter
  static toolCounts: { [key: string]: number } = {};

  constructor({
    model,
    executorPrompt,
    tools,
    agent,
  }: {
    model: BaseLanguageModel;
    executorPrompt: string;
    tools: DynamicStructuredTool[];
    agent: BaseAgent;
  }) {
    this.model = model;
    this.executorPrompt = executorPrompt;
    this.tools = tools;
    this.agent = agent;
  }

  private handleToolLimit(toolName: string, state: typeof StateAnnotation.State): boolean {
    // Skip counting for ask_user tool
    if (toolName === 'ask_user') {
      return false;
    }

    const currentCount = ExecutorGraph.toolCounts[toolName] || 0;

    if (currentCount >= 5) {
      console.log(`🔴 ExecutorGraph: Tool "${toolName}" exceeded limit (${currentCount}/5)`);

      state.next_node = 'executor_answer';

      if (!state.executor_response_tools) {
        state.executor_response_tools = [];
      }

      state.executor_response_tools.push(
        new ToolMessage({
          tool_call_id: createToolCallId(),
          name: 'executor_limit_reached',
          content: `Tool "${toolName}" exceeded limit (${currentCount}/5 calls)`,
        }),
      );

      return true;
    }

    return false;
  }

  routeAfterAgent(state: typeof StateAnnotation.State) {
    const lastMessage = state.messages[state.messages.length - 1] as AIMessage;

    if (!lastMessage?.tool_calls?.length) {
      console.log('ℹ️ ExecutorGraph: No tool calls found, ending execution');
      return END;
    }

    // Process tool calls from lastMessage
    if (lastMessage.tool_calls.length) {
      for (const toolCall of lastMessage.tool_calls) {
        // Skip counting for ask_user tool
        if (toolCall.name !== 'ask_user') {
          ExecutorGraph.toolCounts[toolCall.name] =
            (ExecutorGraph.toolCounts[toolCall.name] || 0) + 1;

          if (this.handleToolLimit(toolCall.name, state)) {
            return 'executor_terminate';
          }
        }
      }
    }

    if (lastMessage.tool_calls[0]?.name === 'terminate') {
      return 'executor_terminate';
    }

    if (lastMessage?.tool_calls?.length && lastMessage?.tool_calls[0]?.name === 'ask_user') {
      return 'ask_user';
    }

    return 'executor_tools';
  }

  

  private validateMessageSequence(messages: BaseMessage[]): BaseMessage[] {
    const toolCallMap = new Map<string, AIMessage>();
    const toolResponseMap = new Map<string, ToolMessage>();
    const validatedMessages: BaseMessage[] = [];

    // First pass: collect all tool calls and responses
    messages.forEach(msg => {
      if (msg instanceof AIMessage && msg.tool_calls) {
        msg.tool_calls.forEach(tc => {
          if (tc.id) toolCallMap.set(tc.id, msg);
        });
      }
      if (msg instanceof ToolMessage) {
        toolResponseMap.set(msg.tool_call_id, msg);
      }
    });

    // Second pass: build validated sequence
    messages.forEach(msg => {
      if (msg instanceof AIMessage) {
        if (!msg.tool_calls?.length) {
          validatedMessages.push(msg);
        } else {
          const hasAllResponses = msg.tool_calls.every(tc => 
            tc.id && toolResponseMap.has(tc.id)
          );
          if (hasAllResponses) {
            validatedMessages.push(msg);
            // Add corresponding tool responses immediately after
            msg.tool_calls.forEach(tc => {
              if (tc.id) {
                const response = toolResponseMap.get(tc.id);
                if (response) validatedMessages.push(response);
              }
            });
          }
        }
      }
    });

    return validatedMessages;
  }

  private validateState(state: typeof StateAnnotation.State, node: string) {
    const validation = {
      hasMessages: Boolean(state.messages?.length),
      hasExecutorInput: Boolean(state.executor_input),
      hasExecutorTools: Boolean(state.executor_response_tools?.length),
      isResumed: Boolean(state.resumed_from_interrupt)
    };

    console.log(`🔍 ExecutorGraph: State validation at ${node}:`, validation);

    return validation;
  }

  async executorAgentNode(state: typeof StateAnnotation.State) {
    const validation = this.validateState(state, 'executorAgentNode');
    if (!validation.hasMessages && !validation.hasExecutorInput) {
      console.warn('⚠️ ExecutorGraph: Missing required state properties');
    }
    
    // Initialize messages array if undefined and validate sequence
    const messages = this.validateMessageSequence(state.messages ?? []);
    
    // Get all previous ask_user interactions with null check
    const askUserInteractions = messages
      .filter(msg => msg instanceof ToolMessage && msg.name === 'ask_user');

    // Create a summary of previous interactions
    let interactionSummary = '';
    if (askUserInteractions && askUserInteractions.length > 0) {
      try {
        interactionSummary = askUserInteractions
          .map(msg => {
            const question = msg.additional_kwargs?.original_question;
            const answer = msg.content;
            return question && answer ? `Q: ${question}\nA: ${answer}` : '';
          })
          .filter(Boolean) // Remove empty strings
          .join('\n');
      } catch (error) {
        console.error('Error creating interaction summary:', error);
        interactionSummary = '';
      }
    }

    // Add interaction summary to prompt
    const systemMessages = [
      { role: 'system', content: this.executorPrompt }
    ];
    
    // Only add interaction summary if it exists
    if (interactionSummary) {
      systemMessages.push({ role: 'system', content: `Previous user interactions:\n${interactionSummary}` });
    }

    const prompt = ChatPromptTemplate.fromMessages([
      ...systemMessages,
      { role: 'human', content: '{input}' },
      new MessagesPlaceholder('messages')
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
      console.log('🔄 ExecutorGraph: Binding tools to model');
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
      messages: messages  // Use validated messages
    });

    return { 
      messages: [...messages, responseMessage],
      executor_response_tools: state.executor_response_tools ?? [],
      resumed_from_interrupt: false
    };
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
                '\n User response: ' +
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

    state.next_node = 'executor_answer';

    // Check if plan executed successfully
    const allTasksCompleted = state.plans?.every(plan =>
      plan.tasks.every(task => task.status === 'completed'),
    );

    if (allTasksCompleted) {
      console.log('✅ ExecutorGraph: All tasks completed successfully');
      return {
        executor_response_tools: [
          ...(state.executor_response_tools ?? []),
          new ToolMessage({
            tool_call_id: createToolCallId(),
            name: 'executor',
            content: 'All tasks completed successfully',
          }),
        ],
      };
    }

    const toolName = lastMessage.tool_calls?.[0]?.name;
    if (!toolName) {
      return {
        executor_response_tools: [
          ...(state.executor_response_tools ?? []),
          new ToolMessage({
            tool_call_id: createToolCallId(),
            name: 'executor',
            content: lastMessage.tool_calls?.[0]?.args?.reason ?? '',
          }),
        ],
      };
    }

    // Check tool limit
    if (this.handleToolLimit(toolName, state)) {
      return {
        executor_response_tools: [
          ...(state.executor_response_tools ?? []),
          new ToolMessage({
            tool_call_id: createToolCallId(),
            name: 'executor',
            content: lastMessage.tool_calls?.[0]?.args?.reason ?? '',
          }),
        ],
      };
    }

    console.log('✅ ExecutorGraph: Terminate node processing complete');
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

    // Get all tool calls that need responses
    const toolResponses = await Promise.all(
      (lastMessage.tool_calls || []).map(async toolCall => {
        const question = toolCall.args?.question ?? '';

        const userResponse = interrupt({
          question: question,
          context: {
            currentTask: state.executor_input,
            toolName: toolCall.name
          }
        });

        return new ToolMessage({
          content: userResponse.input,
          tool_call_id: toolCall.id ?? createToolCallId(),
          name: 'ask_user',
          additional_kwargs: {
            original_question: question,
            response_type: 'user_input'
          }
        });
      })
    );

    // Add a system message to provide context about the user's response
    const contextMessages = toolResponses.map(response => 
      new AIMessage({
        content: `User provided answer to "${response.additional_kwargs?.original_question}": ${response.content}`
      })
    );

    return {
      messages: [
        ...state.messages ?? [], // Keep all previous messages
        ...toolResponses,       // Add tool responses
        ...contextMessages      // Add context messages
      ],
      executor_input: state.executor_input,
      executor_response_tools: [
        ...(state.executor_response_tools ?? []),
        ...toolResponses
      ],
      resumed_from_interrupt: true
    };
  }

  create() {
    console.log('🚀 ExecutorGraph: Creating executor graph');
    const executorGraph = new StateGraph(StateAnnotation)
      .addNode('executor_agent', this.executorAgentNode.bind(this))
      .addNode('executor_tools', new ToolNode(this.tools))
      .addNode('executor_terminate', this.executorTerminateNode.bind(this))
      .addNode('ask_user', this.askNode.bind(this))
      .addEdge(START, 'executor_agent')
      .addConditionalEdges('executor_agent', this.routeAfterAgent.bind(this), {
        __end__: END,
        ask_user: 'ask_user',
        executor_tools: 'executor_tools',
        executor_terminate: 'executor_terminate',
      })
      // ask_user always returns to executor_agent to continue execution
      .addEdge('ask_user', 'executor_agent')
      .addEdge('executor_tools', 'executor_agent')
      .addEdge('executor_terminate', END);

    return executorGraph.compile();
  }
}