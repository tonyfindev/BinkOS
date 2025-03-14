import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IToolConfig } from './types';
import { BaseTool } from './BaseTool';
import { createNetworkSchema } from './schemas';
import { LangGraphRunnableConfig } from '@langchain/langgraph';

export class PlanningTool extends BaseTool {
  getName(): string {
    return 'planning';
  }

  getDescription(): string {
    return `Plan list to execute the user's request. You must break down details of the plan into tasks.`;
  }

  getSchema(): z.ZodObject<any> {
    return z.object({
      command: z.enum(['create', 'update', 'delete']).describe('The command to execute'),
      plans: z
        .array(
          z.object({
            title: z.string().describe('The title of the plan'),
            status: z
              .enum(['pending', 'completed', 'in-progress'])
              .describe('The status of the plan'),
            tasks: z
              .array(
                z.object({
                  title: z.string().describe('The title of the task'),
                  status: z.enum(['pending', 'completed']).describe('The status of the task'),
                }),
              )
              .describe('The tasks to execute the plan'),
            plan_id: z
              .string()
              .optional()
              .describe('The id of the plan. Required if command is update or delete.'),
          }),
        )
        .describe('The plans to execute'),
    });
  }

  private createPlanId() {
    // random 5 characters
    return Math.random().toString(36).substring(2, 7);
  }

  private createPlan(plans: any[]) {
    return plans.map((plan: any) => {
      return {
        plan_id: this.createPlanId(),
        title: plan.title,
        status: 'pending',
        tasks: plan.tasks.map((task: any) => {
          return {
            title: task.title,
            status: 'pending',
          };
        }),
      };
    });
  }

  private updatePlan(plans: any[]) {
    return plans.map((plan: any) => {
      //check plan status is completed
      const isPlanCompleted = plan.tasks.every((task: any) => task.status === 'completed');
      // check plan status is in progress
      const isPlanInProgress = plan.tasks.some((task: any) => task.status === 'completed');
      return {
        plan_id: plan.plan_id,
        title: plan.title,
        status: isPlanCompleted ? 'completed' : isPlanInProgress ? 'in-progress' : 'pending',
        tasks: plan.tasks.map((task: any) => {
          return {
            title: task.title,
            status: task.status,
          };
        }),
      };
    });
  }
  createTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async ({ command, plans }, config?: LangGraphRunnableConfig) => {
        console.log('🤖 Planning tool config:', config?.store);
        const userId = config?.configurable?.userId;
        switch (command) {
          case 'create':
            const result = this.createPlan(plans);
            config?.store?.put([userId, 'plans'], 'plans', result);
            console.log('🤖 Plans after create:', config?.store?.get([userId, 'plans'], 'plans'));
            return JSON.stringify(result);
          case 'update':
            const result2 = this.updatePlan(plans);
            config?.store?.put([userId, 'plans'], 'plans', result2);
            console.log('🤖 Plans after update:', config?.store?.get([userId, 'plans'], 'plans'));
            return JSON.stringify(result2);
        }

        return JSON.stringify([]);
      },
    });
  }
}
