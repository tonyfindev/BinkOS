import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { CustomDynamicStructuredTool, ITool } from '../../tools';
import { IAgent } from '../../types';

// export const terminateTool = tool(
//   async (input: {}) => {
//     return 'finished';
//   },
//   {
//     name: 'terminate',
//     description:
//       'Use this tool if it is completed or failed many times or you need ask user for more information.',
//     schema: z.object({}),
//   },
// );

export class TerminateTool implements ITool {
  getName(): string {
    return 'terminate';
  }
  getDescription(): string {
    return 'Use this tool if it is completed or failed many times or you need ask user for more information.';
  }
  getSchema(): z.ZodObject<any> {
    return z.object({});
  }
  createTool(): CustomDynamicStructuredTool {
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async () => {
        return 'finished';
      },
    };
  }
  setAgent(agent: IAgent): void {
    throw new Error('Method not implemented.');
  }
  mockResponseTool(args: any): Promise<string> {
    return Promise.resolve(
      JSON.stringify({
        status: args.status,
      }),
    );
  }
}
