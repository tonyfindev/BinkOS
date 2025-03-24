import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCurrentTaskInput } from '@langchain/langgraph';
import { ToolMessage } from '@langchain/core/messages';
import { pick } from 'lodash';
import { CustomDynamicStructuredTool, ITool, ToolProgress } from '../../tools';
import { IAgent } from '../../types';

const updatePlan = (
  plan_id: string,
  tasks: {
    title?: string;
    index: number;
    status: string;
    response_tool_id: string;
    response_data_paths: string[];
  }[],
) => {
  const plans = (getCurrentTaskInput() as any).plans;
  const responseTools = (getCurrentTaskInput() as any).executor_response_tools as ToolMessage[];

  const plan = plans.find((plan: any) => plan.plan_id === plan_id);

  if (!plan) {
    throw new Error('Plan not found');
  }

  plan.tasks = plan.tasks.map((task: any, index: number) => {
    const taskToUpdate = tasks.find((task: any) => task.index === index);
    if (taskToUpdate) {
      const responseTool = responseTools.find(
        (tool: ToolMessage) => tool.tool_call_id === taskToUpdate.response_tool_id,
      );
      let responseData = null;
      if (responseTool) {
        try {
          responseData = JSON.parse(responseTool.content as string);
        } catch (e) {
          responseData = responseTool.content;
        }

        const responseDataPaths = taskToUpdate.response_data_paths;
        responseData = pick(responseData, responseDataPaths);
      }

      return {
        title: taskToUpdate.title ?? task.title,
        status: taskToUpdate.status,
        retry: taskToUpdate.status === 'failed' ? (task.retry ?? 0) + 1 : (task.retry ?? 0),
        result: responseData,
      };
    }
    return task;
  });

  // Add new tasks to the plan
  const newTasks = tasks.filter((task: any) => task.index >= plan.tasks.length);

  plan.tasks = [
    ...plan.tasks,
    ...newTasks.map((task: any, index: number) => ({
      title: task.title,
      status: 'pending',
      index: index + plan.tasks.length,
    })),
  ];

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
      tasks: plan.tasks.map((task: any, index: number) => {
        return {
          title: task.title,
          status: task.status,
          retry: task.status === 'failed' ? task.retry : undefined,
          result: task.result,
          index,
        };
      }),
    };
  });
};

// export const updatePlanTool = tool(
//   async ({
//     plan_id,
//     tasks,
//   }: {
//     plan_id: string;
//     tasks: {
//       title?: string;
//       index: number;
//       status: string;
//       response_tool_id: string;
//       response_data_paths: string[];
//     }[];
//   }) => {

//     const result = updatePlan(plan_id, tasks);
//     return result;
//   },
//   {
//     name: 'update_plan',
//     description: 'You can update multiple tasks in the plan',
//     schema: z.object({
//       plan_id: z.string().describe('The id of the plan'),
//       tasks: z
//         .array(
//           z.object({
//             title: z
//               .string()
//               .optional()
//               .describe(
//                 'The title of the task that need to be updated, if not provided, the task will not be updated',
//               ),
//             index: z.number().describe('The index of the task that need to be updated'),
//             status: z
//               .enum(['pending', 'in-progress', 'completed', 'failed'])
//               .describe('The status of the task'),
//             response_tool_id: z
//               .string()
//               .describe(
//                 'The response tool id of the task, empty if the task is pending or in-progress',
//               ),
//             response_data_paths: z
//               .array(z.string())
//               .describe(
//                 'The paths JSON of the response data of the task, empty if the task is pending or in-progress',
//               ),
//           }),
//         )
//         .describe('Only update the tasks that need to be updated'),
//     }),
//   },
// );

export class UpdatePlanTool implements ITool {
  getName(): string {
    return 'update_plan';
  }
  getDescription(): string {
    return 'You can update multiple tasks in the plan';
  }
  getSchema(): z.ZodObject<any> {
    return z.object({
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
            response_tool_id: z
              .string()
              .describe(
                'The response tool id of the task, empty if the task is pending or in-progress',
              ),
            response_data_paths: z
              .array(z.string())
              .describe(
                'The paths JSON of the response data of the task, empty if the task is pending or in-progress',
              ),
          }),
        )
        .describe('Only update the tasks that need to be updated'),
    });
  }
  createTool(): CustomDynamicStructuredTool {
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (
        {
          plan_id,
          tasks,
        }: {
          plan_id: string;
          tasks: {
            title?: string;
            index: number;
            status: string;
            response_tool_id: string;
            response_data_paths: string[];
          }[];
        },
        runManager?: any,
        config?: any,
        onProgress?: (data: ToolProgress) => void,
      ) => {
        return updatePlan(plan_id, tasks);
      },
    };
  }
  setAgent(agent: IAgent): void {
    throw new Error('Method not implemented.');
  }
}
