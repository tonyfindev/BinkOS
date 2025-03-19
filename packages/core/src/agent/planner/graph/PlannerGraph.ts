import { BaseMessage } from '@langchain/core/messages';
import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import { NetworkName } from '../../..';
import { BaseLanguageModel } from '@langchain/core/language_models/base';
import { MessagesPlaceholder } from '@langchain/core/prompts';
import { ChatPromptTemplate } from '@langchain/core/prompts';
import { createReactAgent } from '@langchain/langgraph/prebuilt';
import { convertToOpenAITool } from '@langchain/core/utils/function_calling';
import { createPlanTool } from '../tools/CreatePlanTool';
import { shouldBindTools } from '../utils/llm';
import { selectTasksTool } from '../tools/SelectTasksTool';
import { terminateTool } from '../tools/TerminateTool';
import { updatePlanTool } from '../tools/UpdatePlanTool';

const StateAnnotation = Annotation.Root({
  planner_messages: Annotation<BaseMessage[]>,
  executor_messages: Annotation<BaseMessage[]>,
  executor_input: Annotation<string>,
  input: Annotation<string>,
  // input: Annotation<string>({
  //     reducer: (x, y) => y,
  // }),
  // next_input: Annotation<string>({
  //     reducer: (x, y) => y,
  // }),
  // messages: Annotation<BaseMessage[]>({
  //     reducer: (x, y) => x.concat(y),
  // }),
  // messages2: Annotation<BaseMessage[]>({
  //     reducer: (x, y) => x.concat(y),
  // }),
  // chat_history: Annotation<BaseMessage[]>({
  //     reducer: (x, y) => x.concat(y),
  // }),
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
  active_plan_id: Annotation<string>,
  selected_task_indexes: Annotation<number[]>,
  next_node: Annotation<string>,
});

export class PlannerGraph {
  private model: BaseLanguageModel;
  private createPlanPrompt: string;
  private updatePlanPrompt: string;
  private activeTasksPrompt: string;
  private listToolsPrompt: string;

  constructor({
    model,
    createPlanPrompt,
    updatePlanPrompt,
    activeTasksPrompt,
    listToolsPrompt,
  }: {
    model: BaseLanguageModel;
    createPlanPrompt: string;
    updatePlanPrompt: string;
    activeTasksPrompt: string;
    listToolsPrompt: string;
  }) {
    this.model = model;
    this.createPlanPrompt = createPlanPrompt;
    this.updatePlanPrompt = updatePlanPrompt;
    this.activeTasksPrompt = activeTasksPrompt;
    this.listToolsPrompt = listToolsPrompt;
  }

  async createPlanNode(state: typeof StateAnnotation.State) {
    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.createPlanPrompt + `\n\nList tools:\n\n{toolsStr}`],
      ['human', `Plan to execute the user's request: {input}`],
    ]);

    const tools = [createPlanTool];
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
      toolsStr: this.listToolsPrompt,
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
    const promptActiveTask = `Active task: ${state.active_plan_id}, Selected tasks: ${state.selected_task_indexes}`;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', this.updatePlanPrompt],
      ['human', 'The current plans: {plans}'],
      // ['human', `Plan to execute the user's request: {input}`],
      new MessagesPlaceholder('executor_messages'),
      new MessagesPlaceholder('planner_messages'),
      ['system', `Update current plan: ${promptActiveTask}`],
    ]);
    const tools = [updatePlanTool];
    let modelWithTools;
    if (shouldBindTools(this.model, tools)) {
      if (!('bindTools' in this.model) || typeof this.model.bindTools !== 'function') {
        throw new Error(`llm ${this.model} must define bindTools method.`);
      }
      console.log('binding tools');
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
      toolsStr: this.listToolsPrompt,
      plans: JSON.stringify(state.plans),
      executor_messages: [...(state.executor_messages ?? [])],
      planner_messages: [...(state.planner_messages ?? [])],
    })) as any;

    if (response?.tool_calls) {
      const updatePlanToolCalls = response.tool_calls.filter(
        (toolCall: any) => toolCall.name === 'update_plan',
      );
      if (updatePlanToolCalls.length > 0) {
        const tasks = updatePlanToolCalls.map((toolCall: any) => toolCall.args.tasks).flat();
        const result = await updatePlanTool.invoke({
          plan_id: updatePlanToolCalls[0].args.plan_id,
          tasks,
        });
        return {
          plans: result,
        };
      }
    }
    return response;
  }

  async selectTasksNode(state: typeof StateAnnotation.State) {
    // check if any task retry > 3, if so, terminate the plan
    const planToTerminate = state.plans.find((plan: any) => {
      return plan.tasks.some((task: any) => task.status === 'failed' && task.retry > 3);
    });
    if (planToTerminate) {
      return {
        next_node: END,
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

    const tools = [selectTasksTool, terminateTool];
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
        };
      } else if (toolName === 'terminate') {
        return {
          next_node: END,
        };
      }
    }
  }

  shouldCreateOrUpdatePlan(state: typeof StateAnnotation.State) {
    return !state?.plans || state?.plans.length === 0 ? 'create_plan' : 'update_plan';
  }

  create() {
    const plannerGraph = new StateGraph(StateAnnotation)
      .addNode('create_plan', this.createPlanNode.bind(this))
      .addNode('update_plan', this.updatePlanNode.bind(this))
      .addNode('select_tasks', this.selectTasksNode.bind(this))
      .addConditionalEdges(START, this.shouldCreateOrUpdatePlan, {
        create_plan: 'create_plan',
        update_plan: 'update_plan',
      })
      .addEdge('create_plan', 'select_tasks')
      .addEdge('update_plan', 'select_tasks')
      .addEdge('select_tasks', END);

    return plannerGraph.compile();
  }
}
