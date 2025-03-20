import { z } from 'zod';
import {
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  ToolProgress,
  ErrorStep,
  StructuredError,
  NetworkName,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider, WalletInfo } from './types';

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
      // network: z
      //  .enum(['bnb', 'solana', 'ethereum', 'arbitrum', 'base', 'optimism', 'polygon', 'all'])
      //  .default('all')
      //  .describe('The blockchain to query the wallet on. If not specific, default is all'),
    });
  }

  private isValidAddress(address: string, network: NetworkName): boolean {
    if (network === 'solana') {
      return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
    } else if (['ethereum', 'bnb', 'arbitrum', 'base', 'optimism', 'polygon'].includes(network)) {
      return /^0x[a-fA-F0-9]{40}$/.test(address);
    }
    return false;
  }

  createTool(): CustomDynamicStructuredTool {
    console.log('🛠️ Creating wallet balance tool');
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
          const supportedNetworks = this.getsupportedNetworks();
          let finalResults: Record<
            string,
            {
              data: WalletInfo;
              errors?: Record<string, string>;
              address: string;
            }
          > = {};

          for (const network of supportedNetworks) {
            let networkAddress = address;

            try {
              if (!networkAddress) {
                networkAddress = await this.agent.getWallet().getAddress(network as NetworkName);
                console.log(`🔑 Using agent wallet address: ${networkAddress} for ${network}`);
              }

              if (!this.isValidAddress(networkAddress, network as NetworkName)) {
                console.warn(`⚠️ Invalid address format for network ${network}: ${networkAddress}`);
                continue;
              }

              console.log(`🔍 Getting wallet balance for ${networkAddress} on ${network}`);

              // STEP 2: Check providers
              const providers = this.registry.getProvidersByNetwork(network as NetworkName);
              if (providers.length === 0) {
                console.warn(`⚠️ No providers available for network ${network}`);
                continue;
              }

              let results: WalletInfo = {};
              const errors: Record<string, string> = {};

              // STEP 3: Query providers
              for (const provider of providers) {
                try {
                  const data = await provider.getWalletInfo(networkAddress, network as NetworkName);
                  results = mergeObjects(results, data);
                } catch (error) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  errors[provider.getName()] = errorMessage;
                  console.warn(`⚠️ Provider ${provider.getName()} failed: ${errorMessage}`);
                  continue;
                }
              }

              // Filter out tokens with very small balances
              if (results.tokens && Array.isArray(results.tokens)) {
                results.tokens = results.tokens.filter(token => {
                  if (token.symbol === 'BNB' || token.symbol === 'ETH' || token.symbol === 'SOL') {
                    return true; // These tokens are never filtered
                  }
                  return Number(token.balance) > 0.00001; // This filters out small balance tokens
                });
              }

              // Add results to finalResults if there are any tokens remaining
              if (Object.keys(results).length > 0 && results.tokens && results.tokens.length > 0) {
                // Ensure results has data and tokens is a non-empty array
                finalResults[network] = {
                  data: results,
                  errors: Object.keys(errors).length > 0 ? errors : undefined,
                  address: networkAddress,
                };
              }
            } catch (error) {
              console.error(`❌ Error processing network ${network}:`, error);
              continue;
            }
          }

          // If no valid data was retrieved for any network, throw an error
          if (Object.keys(finalResults).length === 0) {
            throw this.createError(
              ErrorStep.DATA_RETRIEVAL,
              `Failed to get wallet information for any network.`,
              { address },
            );
          }

          onProgress?.({
            progress: 100,
            message: `Successfully retrieved wallet information for ${address}`,
          });
          console.log('🔍 Final results:', finalResults);
          return JSON.stringify({
            status: 'success',
            results: finalResults,
          });
        } catch (error) {
          console.error('❌ Error in wallet balance tool:', error);
          return this.handleError(error, args);
        }
      },
    };
  }
}
