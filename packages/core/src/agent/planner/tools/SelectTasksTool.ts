import { z } from 'zod';
import { tool } from '@langchain/core/tools';
import { getCurrentTaskInput } from '@langchain/langgraph';

export const selectTasksTool = tool(
  async ({ plan_id, task_indexes }: { plan_id: string; task_indexes: number[] }) => {
    const plans = (getCurrentTaskInput() as any).plans as {
      plan_id: string;
      title: string;
      status: string;
      tasks: { title: string; status: string; result?: string }[];
      id: string;
    }[];

    const plan = plans.find((plan: any) => plan.plan_id === plan_id);
    if (!plan) {
      throw new Error('Plan not found');
    }
    const tasks = plan.tasks.filter((task, index) => task_indexes.includes(index));
    //get task done
    const taskDone = plan.tasks.filter(task => task.status === 'completed');
    let content = `I need to execute the following steps:
${tasks.map(task => `- ${task.title} => ${task.status}`).join('\n')}`;

    if (taskDone.length > 0) {
      content += `\n\nThe steps done are: \n ${taskDone
        .map(task => {
          try {
            return `"- ${task.title} => ${JSON.stringify(task.result)}"`;
          } catch (e) {
            return `"- ${task.title} => ${task.result}`;
          }
        })
        .join('\n')}`;
    }

    return content;
  },
  {
    name: 'select_tasks',
    description: 'Select the tasks. No more than 3 tasks',
    schema: z.object({
      plan_id: z.string().describe('The id of the plan'),
      task_indexes: z
        .array(z.number())
        .describe('The indexes of the tasks to executor need handle'),
    }),
  },
);
