import { AIMessage, BaseMessage, HumanMessage, ToolMessage } from '@langchain/core/messages';
import { Annotation, END, interrupt, START, StateGraph } from '@langchain/langgraph';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { MessagesPlaceholder } from '@langchain/core/prompts';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { shouldBindTools } from '../utils/llm';
import { PlanningAgent } from '../PlanningAgent';
import { AgentConfig, AgentContext, AgentExecuteParams, AgentNodeTypes, IAgent } from '../../types';
import { CreatePlanTool } from '../tools/CreatePlanTool';
import { BaseAgent } from '../../BaseAgent';
import { UpdatePlanTool } from '../tools/UpdatePlanTool';
import { SelectTasksTool } from '../tools/SelectTasksTool';
import { TerminateTool } from '../tools/TerminateTool';
import { AskTool } from '../tools/AskTool';

const StateAnnotation = Annotation.Root({
  executor_input: Annotation<string>,
  executor_messages: Annotation<string>,
  input: Annotation<string>,
  executor_response_tools: Annotation<ToolMessage[]>,
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
  answer: Annotation<string>,
  chat_history: Annotation<BaseMessage[]>,
  ask_question: Annotation<string>,
});

// Counter to track repeated task selections
let taskSelectionCounter: { [taskId: string]: number } = {};

export class PlannerGraph {
  private model: BaseLanguageModel;
  private createPlanPrompt: string;
  private updatePlanPrompt: string;
  private activeTasksPrompt: string;
  private listToolsPrompt: string;
  private agent: BaseAgent;
  private config: AgentConfig;
  constructor({
    model,
    createPlanPrompt,
    updatePlanPrompt,
    activeTasksPrompt,
    listToolsPrompt,
    agent,
    config,
  }: {
    model: BaseLanguageModel;
    createPlanPrompt: string;
    updatePlanPrompt: string;
    activeTasksPrompt: string;
    listToolsPrompt: string;
    agent: BaseAgent;
    config: AgentConfig;
  }) {
    this.model = model;
    this.createPlanPrompt = createPlanPrompt;
    this.updatePlanPrompt = updatePlanPrompt;
    this.activeTasksPrompt = activeTasksPrompt;
    this.listToolsPrompt = listToolsPrompt;
    this.agent = agent;
    this.config = config;
  }

  async createPlanNode(state: typeof StateAnnotation.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.createPlanPrompt + `\n\nList tools:\n\n{toolsStr}`],
      new MessagesPlaceholder('chat_history'),
      ['human', `Plan to execute the user's request: {input}`],
    ]);

    const createPlanTool = new CreatePlanTool();

    const wrappedCreatePlanTool = this.agent.addTool2CallbackManager(createPlanTool);

    const tools = [wrappedCreatePlanTool];
    let modelWithTools;
    if (shouldBindTools(this.model, tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      console.log('🚀 PlannerGraph: binding tools');
      modelWithTools = this.model.bindTools(tools, {
        tool_choice: 'required',
      });
    } else {
      modelWithTools = this.model;
    }

    const planAgent = prompt.pipe(modelWithTools);

    const response = (await planAgent.invoke({
      input: state.input,
      toolsStr: this.listToolsPrompt,
      chat_history: [...(state.chat_history ?? [])],
    })) as any;

    if (response?.tool_calls) {
      const toolCall = response.tool_calls[0];
      const toolName = toolCall.name;
      const toolArgs = toolCall.args;
      const tool = tools.find(t => t.name === toolName);
      const result = await tool?.invoke(toolArgs);
      if (toolName === 'create_plan') {
        return {
          plans: result,
        };
      }
    }
    return response;
  }

  async updatePlanNode(state: typeof StateAnnotation.State) {
    // Check signals from tool limit
    if (
      state.next_node === 'executor_answer' ||
      state.executor_response_tools?.some(t => t.name === 'executor_limit_reached')
    ) {
      console.log('🔴 PlannerGraph: Tool limit detected, forwarding to executor_answer');
      return {
        next_node: 'executor_answer',
        plans: state.plans,
      };
    }

    // For other END conditions, check retry limit first
    const maxRetryPlan = state.plans?.find((plan: any) => {
      return plan.tasks.some((task: any) => task.status === 'failed' && task.retry >= 5);
    });

    if (maxRetryPlan) {
      console.log('🔴 PlannerGraph: Plan has exceeded retry limit (5 attempts)');
      return {
        next_node: 'executor_answer',
        plans: state.plans,
      };
    }

    const promptActiveTask = `Active task: ${state.active_plan_id}, Selected task indexes: ${state.selected_task_indexes}`;

    if (!state.plans || !state.plans.length) {
      console.error('🔴 PlannerGraph: No plans found in state, cannot update');
      return { next_node: 'executor_answer' };
    }

    // Check if all plans are completed
    const allPlansCompleted = state.plans.every(plan => plan.status === 'completed');
    if (allPlansCompleted) {
      console.log('✅ PlannerGraph: All plans completed, routing to executor_answer');
      return {
        next_node: 'executor_answer',
        plans: state.plans,
      };
    }

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.updatePlanPrompt],
      ['human', 'The current plans: {plans}'],
      new MessagesPlaceholder('executor_response_tools'),
      ['human', `Update current plan: ${promptActiveTask}`],
    ]);

    const updatePlanTool = new UpdatePlanTool();
    const wrappedUpdatePlanTool = this.agent.addTool2CallbackManager(updatePlanTool);

    const tools = [wrappedUpdatePlanTool];
    let modelWithTools;
    if (shouldBindTools(this.model, tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      console.log('🚀 PlannerGraph: binding tools');
      modelWithTools = this.model.bind({
        tools: tools.map(t => convertToOpenAITool(t)),
        tool_choice: 'required',
      } as any);
    } else {
      modelWithTools = this.model;
    }

    const planAgent = prompt.pipe(modelWithTools);
    let responseTools = state.executor_response_tools ?? [];

    // Remove executor tool if there are any other tools
    if (responseTools.filter((tool: ToolMessage) => tool.name != 'executor').length > 0) {
      responseTools = responseTools.filter((tool: ToolMessage) => tool.name != 'executor');
    }

    const toolMessages = responseTools.map((m: ToolMessage) => {
      return new HumanMessage(
        `Response tool id: ${m.tool_call_id}\n Tool name: ${m.name} \n ${m.content}`,
      );
    });

    const response = (await planAgent.invoke({
      input: state.input,
      toolsStr: this.listToolsPrompt,
      plans: JSON.stringify(state.plans),
      executor_response_tools: toolMessages,
    })) as any;

    if (response?.tool_calls) {
      const updatePlanToolCalls = response.tool_calls.filter(
        (toolCall: any) => toolCall.name === 'update_plan',
      );
      if (updatePlanToolCalls.length > 0) {
        const tasks = updatePlanToolCalls.map((toolCall: any) => toolCall.args.tasks).flat();
        try {
          const result = await wrappedUpdatePlanTool.invoke({
            plan_id: updatePlanToolCalls[0].args.plan_id,
            tasks,
          });
          return {
            plans: result,
          };
        } catch (error) {
          console.error('🔴 PlannerGraph: Error updating plan');
          return {
            next_node: 'executor_answer',
            plans: state.plans,
          };
        }
      }
    }

    // If no tool calls or not update_plan, set next_node to 'executor_answer'
    // to avoid infinite loop
    console.log('🔀 PlannerGraph: No valid tool calls, forwarding to executor_answer');
    return {
      next_node: 'executor_answer',
      plans: state.plans,
    };
  }

  async executorAnswerNode(state: typeof StateAnnotation.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.config.systemPrompt || ''],
      new MessagesPlaceholder('chat_history'),
      ['human', `{input}`],
      ['human', 'plans: {plans}'],
      ['human', 'current task that face problem when execute the plan: {problem}'],
      [
        'system',
        `Information that the task have failed if have problem. Help explain and suggest solution for user to handle failed tasks by:
      1. Identifying the specific errors and failures
      2. Providing a targeted solution
      3. Suggesting a workaround if needed
      I'll focus on clear, actionable steps to fix the immediate issue.`,
      ],
    ]);

    const problemTaskInfo = JSON.stringify(
      state.plans?.flatMap(plan =>
        plan.tasks
          .filter(task => task.status === 'failed' || task.status === 'pending')
          .map(task => ({
            plan_id: plan.id,
            plan_title: plan.title,
            task_index: task.index,
            task_title: task.title,
            task_status: task.status,
            task_result: task.result || 'No result provided',
            retry_count: task.retry || 0,
          })),
      ) || 'No problem tasks found',
      null,
      2,
    );

    const response = await prompt.pipe(this.model).invoke({
      input: state.input,
      plans: JSON.stringify(state.plans),
      problem: problemTaskInfo,
      chat_history: state.chat_history || [],
    });

    return { chat_history: [response], answer: response.content };
  }

  async selectTasksNode(state: typeof StateAnnotation.State) {
    // Check if there is a tool limit signal
    if (
      state.next_node === 'executor_answer' ||
      state.executor_response_tools?.some(t => t.name === 'executor_limit_reached')
    ) {
      console.log('🔀 PlannerGraph: Tool limit signal detected, forwarding to executor_answer');
      return {
        next_node: 'executor_answer',
        plans: state.plans,
      };
    }

    // check if any task retry > 3, if so, terminate the plan
    const planToTerminate = state.plans.find((plan: any) => {
      return plan.tasks.some((task: any) => task.status === 'failed' && task.retry > 3);
    });
    if (planToTerminate) {
      console.log('🔀 PlannerGraph: Task retry limit exceeded, routing to executor_answer');
      return {
        next_node: 'executor_answer',
        plans: state.plans,
      };
    }

    // Create a unique key for the current selection
    const taskKey = `${state.active_plan_id}-${state.selected_task_indexes?.join(',')}`;

    // Increment counter for these tasks
    taskSelectionCounter[taskKey] = (taskSelectionCounter[taskKey] || 0) + 1;

    // If we've selected the same tasks 3+ times and they're still pending, break the loop
    if (taskSelectionCounter[taskKey] >= 3) {
      const pendingTasks = state.plans
        .find(p => p.id === state.active_plan_id)
        ?.tasks.filter(
          (t, idx) => state.selected_task_indexes?.includes(idx) && t.status === 'pending',
        );

      if (pendingTasks && pendingTasks.length > 0) {
        console.log(
          `🔄 Detected loop - same tasks selected ${taskSelectionCounter[taskKey]} times without progress`,
        );
        // Make sure to set next_node to 'executor_answer' instead of END
        return {
          next_node: 'executor_answer',
          plans: state.plans,
        };
      }
    }

    // Check if all tasks in the plan are completed
    const currentPlan = state.plans.find(p => p.id === state.active_plan_id);
    const allTasksCompleted = currentPlan?.tasks.every(t => t.status === 'completed');

    if (currentPlan && allTasksCompleted) {
      console.log(
        '✅ PlannerGraph: All tasks completed in current plan, routing to executor_answer',
      );
      currentPlan.status = 'completed';
      return {
        next_node: 'executor_answer',
        plans: state.plans,
      };
    }

    const prompt = ChatPromptTemplate.fromMessages([
      [
        'system',
        `Based on the plan, Select the tasks to executor need handle, You can select multiple tasks. \n` +
          this.activeTasksPrompt,
      ],
      ['human', `The current plan: {plan}`],
    ]);

    const selectTasksTool = new SelectTasksTool();
    const wrappedSelectTasksTool = this.agent.addTool2CallbackManager(selectTasksTool);

    const terminateTool = new TerminateTool();
    const wrappedTerminateTool = this.agent.addTool2CallbackManager(terminateTool);

    const askTool = new AskTool();
    const wrappedAskTool = this.agent.addTool2CallbackManager(askTool);

    const tools = [wrappedSelectTasksTool, wrappedTerminateTool, wrappedAskTool];
    let modelWithTools;
    if (shouldBindTools(this.model, tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      modelWithTools = this.model.bind({
        tools: tools.map(t => convertToOpenAITool(t)),
        tool_choice: 'required',
      } as any);
    } else {
      modelWithTools = this.model;
    }

    const planAgent = prompt.pipe(modelWithTools);

    const response = (await planAgent.invoke({
      input: state.input,
      plan: JSON.stringify(state.plans),
    })) as any;

    if (response?.tool_calls) {
      const toolCall = response.tool_calls[0];
      const toolName = toolCall.name;
      const toolArgs = toolCall.args;
      const tool = tools.find(t => t.name === toolName);
      if (toolName === 'select_tasks') {
        const next_input = await tool?.invoke(toolArgs);
        return {
          selected_task_indexes: toolArgs.task_indexes,
          active_plan_id: toolArgs.plan_id,
          executor_input: next_input,
          next_node: 'execution',
        };
      } else if (toolName === 'terminate') {
        // Change from END to 'executor_answer' for clarity
        return {
          next_node: 'executor_answer',
          plans: state.plans,
        };
      } else if (toolName === 'ask') {
        return {
          next_node: 'ask',
          ask_question: toolArgs.question,
        };
      }
    }
  }

  async askNode(state: typeof StateAnnotation.State) {
    const message = interrupt({
      question: state.ask_question,
    });
    const createToolCallId = () => {
      // random 5 characters
      return Math.random().toString(36).substring(2, 8);
    };
    const toolCallId = createToolCallId();
    return {
      executor_response_tools: [
        ...(state.executor_response_tools ?? []),
        new AIMessage({
          content: '',
          tool_calls: [
            {
              id: toolCallId,
              name: 'ask',
              args: {
                question: state.ask_question,
              },
            },
          ],
        }),
        new ToolMessage({
          content: message,
          tool_call_id: toolCallId,
          name: 'ask',
        }),
      ],
    };

    // Fallback: If no tool calls, switch to executor_answer to end
    return {
      next_node: 'executor_answer',
      plans: state.plans,
    };
  }

  shouldCreateUpdateOrExecuteAnswer(state: typeof StateAnnotation.State) {
    // Full logging for debugging
    console.log('🟢 PlannerGraph: State decision point', {
      state_details: {
        next_node: state.next_node,
        has_plans: Boolean(state?.plans?.length),
        has_limit_tool: state.executor_response_tools?.some(
          t => t.name === 'executor_limit_reached',
        ),
        active_plan_id: state.active_plan_id,
        selected_task_indexes: state.selected_task_indexes,
        executor_tool_count: state.executor_response_tools?.length || 0,
      },
    });

    // Check limit tool FIRST, regardless of next_node
    if (state.executor_response_tools?.some(t => t.name === 'executor_limit_reached')) {
      console.log(
        '🔴 PlannerGraph: Tool limit tool message detected, routing to executor_answer regardless of next_node',
      );
      return 'executor_answer';
    }
    // if (
    //   state.next_node === 'executor_answer' ||                    // Có signal từ node khác
    //   state.executor_response_tools?.some(t => t.name === 'executor_limit_reached') ||  // Tool limit
    //   state.plans?.every(plan => plan.status === 'completed') ||  // Tất cả plans completed
    //   state.plans?.some(plan => plan.tasks.some(task => task.status === 'failed' && (task.retry || 0) >= 5))  // Có task failed quá nhiều
    // ) {
    //   console.log('🔴 PlannerGraph: Found completed or excessively failed plans, routing to executor_answer');
    //   return 'executor_answer';
    // }

    // Then check next_node
    if (state.next_node === 'executor_answer') {
      console.log('🔴 PlannerGraph: next_node is executor_answer, routing accordingly');
      return 'executor_answer';
    }

    // Check for END signal
    if (state.next_node === END) {
      console.log('🔴 PlannerGraph: END state detected, routing to executor_answer');
      return 'executor_answer';
    }

    // Check conditions that determine when to create final result

    // 1. Check if any plan is completed or has errors exceeding retry attempts
    const completedOrFailedPlans = state.plans?.filter(
      plan =>
        plan.status === 'completed' ||
        plan.tasks.some(task => task.status === 'failed' && (task.retry || 0) >= 3),
    );

    if (completedOrFailedPlans?.length > 0) {
      console.log(
        '🔴 PlannerGraph: Found completed or excessively failed plans, routing to executor_answer',
      );
      return 'executor_answer';
    }

    // Kiểm tra nếu tất cả plans đã hoàn thành
    const allPlansCompleted = state.plans?.every(plan =>
      plan.tasks.every(task => task.status === 'completed'),
    );

    if (allPlansCompleted) {
      console.log('✅ PlannerGraph: All plans completed successfully, routing to executor_answer');
      return 'executor_answer';
    }

    // Decision logic based on plans
    if (!state?.plans || state?.plans.length === 0) {
      console.log('🟢 PlannerGraph: No plans found, routing to create_plan');
      return 'create_plan';
    } else {
      console.log('🟢 PlannerGraph: Plans exist, routing to update_plan');
      return 'update_plan';
    }
  }

  routeAfterSelectTasks(state: typeof StateAnnotation.State) {
    if (state.next_node === 'ask') {
      console.log('🔄 PlannerGraph: Need more info, routing to ask node');
      return 'ask';
    }
    
    console.log('🔄 PlannerGraph: Routing to executor via END');
    return END;
  }

  create() {
    const plannerGraph = new StateGraph(StateAnnotation)
      .addNode('create_plan', this.createPlanNode.bind(this))
      .addNode('update_plan', this.updatePlanNode.bind(this))
      .addNode('select_tasks', this.selectTasksNode.bind(this))
      .addNode('executor_answer', this.executorAnswerNode.bind(this))
      // START conditions 
      .addConditionalEdges(START, this.shouldCreateUpdateOrExecuteAnswer, {
        create_plan: 'create_plan',
        update_plan: 'update_plan',
        executor_answer: 'executor_answer',
      })
      // Plan to select_tasks edges
      .addEdge('create_plan', 'select_tasks')
      .addEdge('update_plan', 'select_tasks')
      .addEdge('select_tasks', END)
      .addEdge('executor_answer', END);

    return plannerGraph.compile();
  }
}