import { tool } from '@langchain/core/tools';
import { z } from 'zod';

export const terminateTool = tool(
  async (input: {}) => {
    return 'finished';
  },
  {
    name: 'terminate',
    description:
      'Use this tool if it is completed or failed many times or you need ask user for more information.',
    schema: z.object({}),
  },
);
