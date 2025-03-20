import { z } from 'zod';
import { tool } from '@langchain/core/tools';

const createPlanId = () => {
  // random 5 characters
  return Math.random().toString(36).substring(2, 7);
};

const createPlan = (plans: any[]) => {
  return plans.map((plan: any) => {
    return {
      plan_id: createPlanId(),
      title: plan.title,
      status: 'pending',
      tasks: plan.tasks.map((task: any, index: number) => {
        return {
          title: task,
          status: 'pending',
          index,
        };
      }),
    };
  });
};

export const createPlanTool = tool(
  async ({ plans }: { plans: { title: string; tasks: string[] }[] }) => {
    return createPlan(plans);
  },
  {
    name: 'create_plan',
    description:
      "Create plan list to execute the user's request. You must break down details of the plan into tasks.",
    schema: z.object({
      plans: z
        .array(
          z.object({
            title: z.string().describe('The title of the plan'),
            tasks: z.array(
              z
                .string()
                .describe(
                  'The tasks description to execute the plan. The task must clear and concise',
                ),
            ),
          }),
        )
        .describe('The plans to execute'),
    }),
  },
);
