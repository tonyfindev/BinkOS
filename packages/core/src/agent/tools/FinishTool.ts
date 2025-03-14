import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IToolConfig } from './types';
import { BaseTool } from './BaseTool';
import { createNetworkSchema } from './schemas';

export class FinishTool extends BaseTool {
  getName(): string {
    return 'finish';
  }

  getDescription(): string {
    return `Use this tool to finish the task.`;
  }

  getSchema(): z.ZodObject<any> {
    return z.object({});
  }

  createTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async () => {
        return `Task finished`;
      },
    });
  }
}
