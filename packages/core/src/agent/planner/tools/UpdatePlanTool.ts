import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCurrentTaskInput } from '@langchain/langgraph';

export const updatePlanTool = tool(
  async ({
    plan_id,
    tasks,
  }: {
    plan_id: string;
    tasks: { title?: string; index: number; status: string; result: string }[];
  }) => {
    const updatePlan = (
      plan_id: string,
      tasks: { title?: string; index: number; status: string; result: string }[],
    ) => {
      const plans = (getCurrentTaskInput() as any).plans;

      const plan = plans.find((plan: any) => plan.plan_id === plan_id);

      if (!plan) {
        throw new Error('Plan not found');
      }

      plan.tasks = plan.tasks.map((task: any, index: number) => {
        const taskToUpdate = tasks.find((task: any) => task.index === index);
        if (taskToUpdate) {
          return {
            title: taskToUpdate.title ?? task.title,
            status: taskToUpdate.status,
            retry: taskToUpdate.status === 'failed' ? (task.retry ?? 0) + 1 : (task.retry ?? 0),
            result: taskToUpdate.result,
          };
        }
        return task;
      });

      const newTasks = tasks.filter((task: any) => task.index >= plan.tasks.length);

      plan.tasks = [...plan.tasks, ...newTasks];

      return plans.map((plan: any) => {
        //check plan status is completed
        const isPlanCompleted = plan.tasks.every((task: any) => task.status === 'completed');
        // check plan status is in progress
        const isPlanInProgress =
          plan.tasks.filter((task: any) => task.status === 'pending').length != plan.tasks.length;

        return {
          plan_id: plan.plan_id,
          title: plan.title,
          status: isPlanCompleted ? 'completed' : isPlanInProgress ? 'in-progress' : 'pending',
          tasks: plan.tasks.map((task: any) => {
            return {
              title: task.title,
              status: task.status,
              retry: task.status === 'failed' ? task.retry : undefined,
              result: task.result,
            };
          }),
        };
      });
    };
    const result = updatePlan(plan_id, tasks);
    return result;
  },
  {
    name: 'update_plan',
    description: 'You can update multiple tasks in the plan',
    schema: z.object({
      plan_id: z.string().describe('The id of the plan'),
      tasks: z
        .array(
          z.object({
            title: z
              .string()
              .optional()
              .describe(
                'The title of the task that need to be updated, if not provided, the task will not be updated',
              ),
            index: z.number().describe('The index of the task that need to be updated'),
            status: z
              .enum(['pending', 'in-progress', 'completed', 'failed'])
              .describe('The status of the task'),
            result: z
              .string()
              .describe('The result of the task, empty if the task is pending or in-progress'),
          }),
        )
        .describe('Only update the tasks that need to be updated'),
    }),
  },
);
