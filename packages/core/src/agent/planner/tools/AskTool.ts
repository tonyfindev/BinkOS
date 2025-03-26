import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { getCurrentTaskInput } from '@langchain/langgraph';
import { ToolMessage } from '@langchain/core/messages';
import { pick } from 'lodash';
import { CustomDynamicStructuredTool, ITool, ToolProgress } from '../../tools';
import { IAgent } from '../../types';

export class AskTool implements ITool {
  getName(): string {
    return 'ask_user';
  }
  getDescription(): string {
    return 'You can ask a question to the user to get more information';
  }
  getSchema(): z.ZodObject<any> {
    return z.object({
      question: z.string().describe('The question to ask the user'),
    });
  }
  createTool(): CustomDynamicStructuredTool {
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (
        {
          question,
        }: {
          question: string;
        },
        runManager?: any,
        config?: any,
        onProgress?: (data: ToolProgress) => void,
      ) => {
        return '';
      },
    };
  }
  setAgent(agent: IAgent): void {
    throw new Error('Method not implemented.');
  }
}
