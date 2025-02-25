import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider, WalletInfo } from './types';

export interface WalletToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export class GetWalletBalanceTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: WalletToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultNetwork = config.defaultNetwork || 'bnb';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: IWalletProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'get_wallet_balance';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Get wallet balance from address. Supports networks: ${networks}. Available providers: ${providers}`;
  }

  private getsupportedNetworks(): string[] {
    const agentNetworks = Object.keys(this.agent.getNetworks());
    const providerNetworks = Array.from(this.supportedNetworks);
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const supportedNetworks = this.getsupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      address: z
        .string()
        .optional()
        .describe('The wallet address to query (optional - uses agent wallet if not provided)'),
      network: z
        .enum(supportedNetworks as [string, ...string[]])
        .default(this.defaultNetwork)
        .describe('The blockchain to query the wallet on'),
    });
  }

  createTool(): DynamicStructuredTool<z.ZodObject<any>> {
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const network = args.network || this.defaultNetwork;
          let address = args.address;

          // If no address provided, get it from the agent's wallet
          if (!address) {
            address = await this.agent.getWallet().getAddress(network);
          }

          const providers = this.registry.getProvidersByNetwork(network);
          if (providers.length === 0) {
            throw new Error(`No providers available for network ${network}`);
          }

          const results: Record<string, WalletInfo> = {};
          const errors: Record<string, string> = {};

          // Try all providers and collect results
          for (const provider of providers) {
            try {
              const data = await provider.getWalletInfo(address, network);
              results[provider.getName()] = data;
            } catch (error) {
              console.warn(`Failed to get wallet info from ${provider.getName()}:`, error);
              errors[provider.getName()] = error instanceof Error ? error.message : String(error);
            }
          }

          // If no successful results, throw error
          if (Object.keys(results).length === 0) {
            throw new Error(
              `Failed to get wallet information for ${address} on network ${network}. Errors: ${JSON.stringify(errors)}`,
            );
          }
          console.log('🤖 Wallet info:', results);

          return JSON.stringify({
            status: Object.keys(results).length === 0 ? 'error' : 'success',
            data: results,
            errors,
            network,
          });
        } catch (error) {
          console.error('Wallet info error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            network: args.network || this.defaultNetwork,
          });
        }
      },
    });
  }
}
