import { z } from 'zod';
import {
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  ToolProgress,
  ErrorStep,
  StructuredError,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider, WalletInfo } from './types';
import { NetworkName } from '@binkai/core';

export interface WalletToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export function mergeObjects<T extends Record<string, any>>(obj1: T, obj2: T): T {
  // Create a new object to avoid mutating the inputs
  const result = { ...obj1 };

  // Add or override properties from obj2
  for (const key in obj2) {
    if (Object.prototype.hasOwnProperty.call(obj2, key)) {
      // If both objects have the same key and both values are objects, merge recursively
      if (
        key in result &&
        typeof result[key] === 'object' &&
        result[key] !== null &&
        typeof obj2[key] === 'object' &&
        obj2[key] !== null &&
        !Array.isArray(result[key]) &&
        !Array.isArray(obj2[key])
      ) {
        result[key] = mergeObjects(result[key], obj2[key]);
      } else if (obj2[key] === null || obj2[key] === undefined) {
        // Keep obj1's value if obj2's value is null or undefined
        continue;
      } else if (result[key] === null || result[key] === undefined) {
        // Take obj2's value if obj1's value is null or undefined
        result[key] = obj2[key];
      } else {
        // Otherwise just take the value from obj2
        result[key] = obj2[key];
      }
    }
  }

  return result;
}

export class GetWalletBalanceTool extends BaseTool {
  public registry: ProviderRegistry;
  private supportedNetworks: Set<string>;

  constructor(config: WalletToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: IWalletProvider): void {
    this.registry.registerProvider(provider);
    console.log('🔌 Provider registered:', provider.constructor.name);
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
    return `Get detailed information about tokens and native currencies in a wallet of all network (Solana, Etherum, BNB), including token balances, token addresses, symbols, and decimals. Supports networks: ${networks}. Available providers: ${providers}. Use this tool when you need to check what tokens or coins a wallet contains, their balances, and detailed token information.`;
  }

  private getsupportedNetworks(): NetworkName[] {
    const agentNetworks = Object.keys(this.agent.getNetworks()) as NetworkName[];
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
      // network: z
      //   .enum(['bnb', 'solana', 'ethereum', 'arbitrum', 'base', 'optimism', 'polygon'])
      //   .describe('The blockchain to query the wallet on.'),
    });
  }

  createTool(): CustomDynamicStructuredTool {
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (
        args: any,
        runManager?: any,
        config?: any,
        onProgress?: (data: ToolProgress) => void,
      ) => {
        try {
          let address = args.address;
          let networkResults: Record<string, any> = {};

          // STEP 1: Validate network
          const supportedNetworks = this.getsupportedNetworks();
          for (const network of supportedNetworks) {
            try {
              // STEP 2: Get wallet address
              if (!address) {
                address = await this.agent.getWallet().getAddress(network as NetworkName);
              }

              // STEP 3: Check providers
              const providers = this.registry.getProvidersByNetwork(network);
              if (providers.length === 0) {
                networkResults[network] = {
                  error: `Currently have problem: No providers available for network ${network}`,
                };
                continue;
              }

              let results: WalletInfo = {};
              let hasSuccessfulProvider = false;

              // STEP 4: Query providers
              for (const provider of providers) {
                try {
                  const data = await provider.getWalletInfo(address, network);
                  results = mergeObjects(results, data);
                  hasSuccessfulProvider = true;
                } catch (error) {
                  networkResults[network] = {
                    error: `Currently have problem: Failed to process network ${network} - ${error instanceof Error ? error.message : String(error)}`,
                  };
                }
              }

              // Process results for this network
              if (hasSuccessfulProvider) {
                if (results.tokens && Array.isArray(results.tokens)) {
                  results.tokens = results.tokens.filter(token => {
                    if (token.symbol === 'BNB' || token.symbol === 'ETH' || token.symbol === 'SOL') {
                      return true;
                    }
                    return Number(token.balance) > 0.00001;
                  });
                }
                networkResults[network] = results;
              } else {
                networkResults[network] = {
                  error: `Currently have problem: All providers failed for network ${network}`,
                };
              }

            } catch (error) {
              networkResults[network] = {
                error: `Currently have problem: Failed to process network ${network} - ${error instanceof Error ? error.message : String(error)}`,
              };
            }

            onProgress?.({
              progress: ((supportedNetworks.indexOf(network) + 1) / supportedNetworks.length) * 100,
              message: `Processed network ${network}`,
            });
          }

          return JSON.stringify({
            status: 'success',
            data: networkResults,
            address,
          });
        } catch (error) {
          console.error('❌ Error in wallet balance tool:', error instanceof Error ? error.message : error);
          return this.handleError(error, args);
        }
      },
    };
  }
}
