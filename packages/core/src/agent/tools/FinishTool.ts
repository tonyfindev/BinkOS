import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IToolConfig } from './types';
import { BaseTool } from './BaseTool';
import { createNetworkSchema } from './schemas';

export class FinishTool extends BaseTool {
  getName(): string {
    return 'terminate';
  }

  getDescription(): string {
    return `Use this tool if it is completed or failed many times or you need ask user for more information.`;
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
        return `finished`;
      },
    });
  }
}
