import { z } from 'zod';
import {
  BaseTool,
  CustomDynamicStructuredTool,
  ErrorStep,
  IAgent,
  IToolConfig,
  NetworkName,
  ToolProgress,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ITokenProvider, TokenInfo } from './types';
import { DefaultTokenProvider } from './providers/DefaultTokenProvider';
import { defaultTokens } from './data/defaultTokens';

export interface CreateTokenToolConfig extends IToolConfig {
  supportedNetworks?: NetworkName[];
}

export class CreateTokenTool extends BaseTool {
  public registry: ProviderRegistry;
  private supportedNetworks: Set<NetworkName>;
  private defaultTokenProvider: DefaultTokenProvider;
  // Cache for token information to avoid modifying default tokens
  private tokenCache: Partial<Record<NetworkName, Record<string, TokenInfo>>> = {};

  constructor(config: CreateTokenToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set<NetworkName>(config.supportedNetworks || []);

    // Initialize default token provider
    this.defaultTokenProvider = new DefaultTokenProvider();

    // Register the default token provider first
    this.registerProvider(this.defaultTokenProvider);
    console.log(
      '✓ Default token provider registered with',
      Object.keys(defaultTokens).length,
      'networks and',
      Object.values(defaultTokens).reduce((acc, tokens) => acc + Object.keys(tokens).length, 0),
      'tokens',
    );

    // Initialize token cache for each network
    this.defaultTokenProvider.getSupportedNetworks().forEach(network => {
      this.tokenCache[network] = {};
    });
  }

  registerProvider(provider: ITokenProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered CreateTokenTool', provider.constructor.name);
    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
      // Initialize token cache for this network if it doesn't exist
      if (!this.tokenCache[network]) {
        this.tokenCache[network] = {};
      }
    });
  }

  getName(): string {
    return 'create_token';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Create token blockchain with name, symbol, description using various providers (${providers}). Supports networks: ${networks}.`;
  }

  private getSupportedNetworks(): NetworkName[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks()) as NetworkName[];

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No token providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      name: z.string().describe('The name of token created'),
      symbol: z.string().describe('The symbol of token created'),
      description: z.string().optional().describe('Description of token created'),
      network: z
        .enum(supportedNetworks as [NetworkName, ...NetworkName[]])
        .default(NetworkName.BNB)
        .describe('The network to create the token on'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The DEX provider to use for the swap. If not specified, the best rate will be found',
        ),
    });
  }

  createTool(): CustomDynamicStructuredTool {
    console.log('🛠️ Creating create token tool');
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
          console.log('🤖 Create token Args:', args);
          const { name, symbol, description, network, provider: preferredProvider } = args;
          console.log('🔄 Doing create token operation...');

          // STEP 1: Validate network
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            throw this.createError(
              ErrorStep.NETWORK_VALIDATION,
              `Network ${network} is not supported.`,
              {
                requestedNetwork: network,
                supportedNetworks: supportedNetworks,
              },
            );
          }

          // STEP 3: Get wallet address
          let userAddress;
          try {
            // Get agent's wallet and address
            const wallet = this.agent.getWallet();
            userAddress = await wallet.getAddress(network);
          } catch (error: any) {
            throw this.createError(
              ErrorStep.WALLET_ACCESS,
              `Failed to get wallet address for network ${network}.`,
              {
                network: network,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }

          const createTokenParams: any = {
            name,
            symbol,
            description,
            network,
          };

          let selectedProvider: any;
          let signature: any;

          // onProgress?.({
          //   progress: 0,
          //   message: 'Searching for the best exchange rate for your swap.',
          // });

          // STEP 4: Get provider and quote
          try {
            if (preferredProvider) {
              selectedProvider = this.registry.getProvider(preferredProvider);
              // Validate provider supports the network
              if (!selectedProvider.getSupportedNetworks().includes(network)) {
                throw this.createError(
                  ErrorStep.PROVIDER_VALIDATION,
                  `Provider ${preferredProvider} does not support network ${network}.`,
                  {
                    provider: preferredProvider,
                    requestedNetwork: network,
                    providerSupportedNetworks: selectedProvider.getSupportedNetworks(),
                  },
                );
              }
            } else {
              const providers = this.registry.getProvidersByNetwork(network);
              console.log('🤖 Providers:', providers);
              selectedProvider = providers[1];
            }
          } catch (error: any) {
            if ('step' in error) {
              throw error; // Re-throw structured errors
            }
          }

          // console.log('🤖 The selected provider is:', selectedProvider.getName());

          // onProgress?.({
          //   progress: 10,
          //   message: `Verifying you have sufficient ${quote.fromToken.symbol || 'tokens'} for this swap.`,
          // });

          // onProgress?.({
          //   progress: 20,
          //   message: `Preparing to swap ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for approximately ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}.`,
          // });

          const signatureMessage = await selectedProvider.buildSignatureMessage(userAddress);
          const wallet = this.agent.getWallet();
          signature = await wallet.signMessage({
            network,
            message: signatureMessage,
          });
          // STEP 6: Build swap transaction
          let swapTx;
          try {
            swapTx = await selectedProvider.buildCreateToken(
              createTokenParams,
              userAddress,
              signature,
            );
            console.log('🤖 Swap Tx:', swapTx);
          } catch (error: any) {
            // throw this.createError(
            //   ErrorStep.TOOL_EXECUTION,
            //   `Failed to build the swap transaction.`,
            //   {
            //     provider: selectedProvider.getName(),
            //     network: network,
            //     fromToken: quote.fromToken.symbol || fromToken,
            //     toToken: quote.toToken.symbol || toToken,
            //     error: error instanceof Error ? error.message : String(error),
            //   }
            // );
          }

          console.log('🤖 Creating token...');

          onProgress?.({
            progress: 80,
            message: `Creating token `,
          });

          // STEP 8: Execute swap transaction
          let receipt;
          let finalReceipt;
          try {
            // Sign and send swap transaction
            const wallet = this.agent.getWallet();
            receipt = await wallet.signAndSendTransaction(network, {
              to: swapTx?.tx?.to,
              data: swapTx?.tx?.data,
              value: BigInt(swapTx?.tx?.value || 0),
            });

            // Wait for transaction to be mined
            finalReceipt = await receipt?.wait();
          } catch (error: any) {
            throw this.createError(
              ErrorStep.TOOL_EXECUTION,
              `Failed to execute the swap transaction.`,
              {
                network: network,
                error: error instanceof Error ? error.message : String(error),
              },
            );
          }

          try {
            // Clear token balance caches after successful swap
            // selectedProvider.invalidateBalanceCache(quote.token.address, userAddress, network);
          } catch (error: any) {
            console.error('Error clearing token balance caches:', error);
            // Non-critical error, don't throw
          }

          // onProgress?.({
          //   progress: 100,
          //   message: `Swap complete! Successfully swapped ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}. Transaction hash: ${finalReceipt.hash}`,
          // });

          // Return result as JSON string
          return JSON.stringify({
            status: 'success',
            provider: selectedProvider.getName(),
            token: swapTx.token,
            transactionHash: finalReceipt?.hash,
            network,
          });
        } catch (error: any) {
          console.error('Swap error:', error);

          // Special handling for token validation errors that we can try to fix
          if (
            error instanceof Error ||
            (typeof error === 'object' && error !== null && 'step' in error)
          ) {
            const errorStep = 'step' in error ? error.step : '';
            const isTokenValidationError =
              errorStep === 'token_validation' ||
              errorStep === ErrorStep.TOKEN_NOT_FOUND ||
              error.message?.includes('Invalid token address');

            // if (isTokenValidationError && !args._attempt) {
            //   return await this.attemptTokenAddressFix(args, error);
            // }
          }

          // Use BaseTool's error handling
          return this.handleError(error, args);
        }
      },
    };
  }
}
