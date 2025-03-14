import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, CustomDynamicStructuredTool, IToolConfig, ToolProgress } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IWalletProvider, WalletInfo } from './types';

interface StructuredError {
  step: string;
  message: string;
  details: Record<string, any>;
}

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
  // private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: WalletToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    // this.defaultNetwork = config.defaultNetwork || 'bnb';
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
    return `Get detailed information about tokens and native currencies in a wallet. Shows balances of all tokens (ERC20, NFTs) and native currencies (ETH, BNB, SOL, etc.) that a wallet holds of all network (Solana, Etherum, BNB), including token balances, token addresses, symbols, and decimals. Supports networks: ${networks}. Available providers: ${providers}. Use this tool when you need to check what tokens or coins a wallet contains, their balances, and detailed token information.`;
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
        // .default(this.defaultNetwork)
        .describe('The blockchain to query the wallet on'),
    });
  }

  // Simplified suggestion generator function for WalletBalanceTool
  private generateEnhancedSuggestion(
    errorStep: string,
    structuredError: StructuredError,
    args: any,
  ): string {
    let suggestion = '';
    let alternativeActions: string[] = [];

    // Prefix to clearly indicate this is a WalletBalanceTool error
    const errorPrefix = `[Wallet Balance Tool Error] `;

    switch (errorStep) {
      case 'network_validation':
        const networks = structuredError.details.supportedNetworks || [];
        suggestion = `${errorPrefix}Network validation failed: "${structuredError.details.requestedNetwork}" is not supported for wallet balance queries. Please use one of these networks: ${networks.join(', ')}.`;

        alternativeActions = [
          `Try with a supported network, e.g., "check my balance on bnb"`,
          `List supported networks: "show supported networks for wallet balance"`,
        ];
        break;

      case 'wallet_address':
        suggestion = `${errorPrefix}Wallet address retrieval failed: Could not access wallet address for the ${structuredError.details.network} network. Please ensure your wallet is properly connected and supports this network, or provide an address explicitly.`;

        alternativeActions = [
          `Provide an address explicitly: "check balance of [wallet_address] on ${structuredError.details.network}"`,
          `Try a different network: "check my balance on [different_network]"`,
          `View your wallet addresses: "show my wallet addresses"`,
        ];
        break;

      case 'provider_availability':
        const supportedNets = structuredError.details.supportedNetworks || [];
        suggestion = `${errorPrefix}Provider availability issue: No data providers available for the ${structuredError.details.network} network. This tool supports: ${supportedNets.join(', ')}.`;

        alternativeActions = [
          `Try a supported network: "check my balance on ${supportedNets[0] || 'supported_network'}"`,
          `List available providers: "show wallet data providers"`,
        ];
        break;

      case 'data_retrieval':
        suggestion = `${errorPrefix}Data retrieval failed: Could not get wallet information for address ${structuredError.details.address} on ${structuredError.details.network} network. The address may be invalid, have no activity, or the network may be experiencing issues.`;

        alternativeActions = [
          `Verify the address is correct: "verify address ${structuredError.details.address}"`,
          `Try a different network: "check balance on [different_network]"`,
          `Check network status: "check status of ${structuredError.details.network} network"`,
        ];
        break;

      default:
        suggestion = `${errorPrefix}Wallet balance query failed: An unexpected error occurred while retrieving wallet information. Please check your input parameters and try again.`;

        alternativeActions = [
          `Try with a different network: "check my balance on [network]"`,
          `Provide a specific address: "check balance of [address] on [network]"`,
        ];
    }

    // Create enhanced suggestion with alternative actions
    let enhancedSuggestion = `${suggestion}\n\n`;

    // Add process information
    enhancedSuggestion += `**Wallet Balance Process Stage:** ${errorStep.replace('_', ' ').charAt(0).toUpperCase() + errorStep.replace('_', ' ').slice(1)}\n\n`;

    // Add alternative actions
    if (alternativeActions.length > 0) {
      enhancedSuggestion += `**Suggested commands you can try:**\n`;
      alternativeActions.forEach(action => {
        enhancedSuggestion += `- ${action}\n`;
      });
    }

    return enhancedSuggestion;
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
          const network = args.network;
          let address = args.address;

          // STEP 1: Validate network
          const supportedNetworks = this.getsupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            throw {
              step: 'network_validation',
              message: `Network ${network} is not supported.`,
              details: {
                requestedNetwork: network,
                supportedNetworks: supportedNetworks,
              },
            } as StructuredError;
          }

          // STEP 2: Get wallet address
          try {
            // If no address provided, get it from the agent's wallet
            if (!address) {
              address = await this.agent.getWallet().getAddress(network);
            }
          } catch (error: any) {
            throw {
              step: 'wallet_address',
              message: `Failed to get wallet address for network ${network}.`,
              details: {
                network: network,
                error: error instanceof Error ? error.message : String(error),
              },
            } as StructuredError;
          }

          onProgress?.({
            progress: 20,
            message: `Retrieving wallet information for ${address} on ${network} network.`,
          });

          // STEP 3: Check providers
          const providers = this.registry.getProvidersByNetwork(network);
          if (providers.length === 0) {
            throw {
              step: 'provider_availability',
              message: `No providers available for network ${network}.`,
              details: {
                network: network,
                availableProviders: this.registry.getProviderNames(),
                supportedNetworks: Array.from(this.supportedNetworks),
              },
            } as StructuredError;
          }

          let results: WalletInfo = {};
          const errors: Record<string, string> = {};

          // STEP 4: Query providers
          // Try all providers and collect results
          for (const provider of providers) {
            try {
              const data = await provider.getWalletInfo(address, network);
              results = mergeObjects(results, data);
            } catch (error: any) {
              console.warn(`Failed to get wallet info from ${provider.getName()}:`, error);
              errors[provider.getName()] = error instanceof Error ? error.message : String(error);
            }
          }

          // If no successful results, throw error
          if (Object.keys(results).length === 0) {
            throw {
              step: 'data_retrieval',
              message: `Failed to get wallet information for ${address} on network ${network}.`,
              details: {
                address: address,
                network: network,
                errors: errors,
              },
            } as StructuredError;
          }

          console.log('🤖 Wallet info:', results);

          onProgress?.({
            progress: 100,
            message: `Successfully retrieved wallet information for ${address} on ${network} network.`,
          });

          return JSON.stringify({
            status: 'success',
            data: results,
            errors: Object.keys(errors).length > 0 ? errors : undefined,
            network,
            address,
          });
        } catch (error: any) {
          console.error('Wallet info error:', error);

          // Determine error type and structure response accordingly
          let errorStep = 'unknown';
          let errorMessage = '';
          let errorDetails = {};
          let suggestion = '';

          if (typeof error === 'object' && error !== null) {
            // Handle structured errors we threw earlier
            if ('step' in error) {
              const structuredError = error as StructuredError;
              errorStep = structuredError.step;
              errorMessage = structuredError.message;
              errorDetails = structuredError.details || {};

              // Use enhanced suggestion generator
              suggestion = this.generateEnhancedSuggestion(errorStep, structuredError, args);
            } else if (error instanceof Error) {
              // Handle standard Error objects
              errorStep = 'execution';
              errorMessage = error.message;

              // Create suggestion for standard error
              const mockStructuredError: StructuredError = {
                step: errorStep,
                message: errorMessage,
                details: { error: errorMessage, network: args.network },
              };
              suggestion = this.generateEnhancedSuggestion(errorStep, mockStructuredError, args);
            } else {
              // Handle other error types
              errorStep = 'execution';
              errorMessage = String(error);
              const mockStructuredError: StructuredError = {
                step: errorStep,
                message: errorMessage,
                details: { error: errorMessage, network: args.network },
              };
              suggestion = this.generateEnhancedSuggestion(errorStep, mockStructuredError, args);
            }
          } else {
            // Handle primitive error types
            errorStep = 'execution';
            errorMessage = String(error);
            const mockStructuredError: StructuredError = {
              step: errorStep,
              message: errorMessage,
              details: { error: errorMessage, network: args.network },
            };
            suggestion = this.generateEnhancedSuggestion(errorStep, mockStructuredError, args);
          }

          // Return structured error response with enhanced information
          return JSON.stringify({
            status: 'error',
            tool: 'get_wallet_balance',
            toolType: 'wallet_information',
            process: 'balance_retrieval',
            errorStep: errorStep,
            processStage:
              errorStep.replace('_', ' ').charAt(0).toUpperCase() +
              errorStep.replace('_', ' ').slice(1),
            message: errorMessage,
            details: errorDetails,
            suggestion: suggestion,
            parameters: args,
          });
        }
      },
    };
  }
}
