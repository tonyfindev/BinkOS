import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IToolConfig } from './types';
import { BaseTool } from './BaseTool';
import { createNetworkSchema } from './schemas';

export class GetWalletAddressTool extends BaseTool {
  getName(config: IToolConfig): string {
    return 'get_wallet_address';
  }

  getDescription(config: IToolConfig): string {
    const networks = Object.keys(config.agent.getNetworks()).join(', ');
    return `Get the wallet address for a specific network. Available networks: ${networks}`;
  }

  getSchema(config: IToolConfig): z.ZodObject<any> {
    return z.object({
      network: createNetworkSchema(config.agent),
    });
  }

  createTool(config: IToolConfig): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.getName(config),
      description: this.getDescription(config),
      schema: this.getSchema(config),
      func: async ({ network }) => {
        return await config.agent.getWallet().getAddress(network);
      },
    });
  }
} 