import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IToolConfig } from './types';
import { BaseTool } from './BaseTool';
import { createNetworkSchema } from './schemas';

export class GetWalletAddressTool extends BaseTool {
  getName(): string {
    return 'get_wallet_address';
  }

  getDescription(): string {
    const networks = Object.keys(this.agent.getNetworks()).join(', ');
    return `Get the wallet address for a specific network. Available networks: ${networks}`;
  }

  getSchema(): z.ZodObject<any> {
    return z.object({
      network: createNetworkSchema(this.agent),
    });
  }

  createTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async ({ network }) => {
        return await this.agent.getWallet().getAddress(network);
      },
    });
  }
} 