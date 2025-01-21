import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IToolConfig } from './types';
import { BaseTool } from './BaseTool';
import { createNetworkSchema } from './schemas';

export class SignMessageTool extends BaseTool {
  getName(config: IToolConfig): string {
    return 'sign_message';
  }

  getDescription(config: IToolConfig): string {
    const networks = Object.keys(config.agent.getNetworks()).join(', ');
    return `Sign a message with the wallet. Available networks: ${networks}`;
  }

  getSchema(config: IToolConfig): z.ZodObject<any> {
    return z.object({
      network: createNetworkSchema(config.agent),
      message: z.string().describe('The message to sign'),
    });
  }

  createTool(config: IToolConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.getName(config),
      description: this.getDescription(config),
      schema: this.getSchema(config),
      func: async ({ network, message }) => {
        return await config.agent.getWallet().signMessage({ network, message });
      },
    });
  }
} 