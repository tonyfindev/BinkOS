import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, CustomDynamicStructuredTool, IToolConfig, ToolProgress } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ISwapProvider, SwapQuote, SwapParams } from './types';
import { validateTokenAddress } from './utils/addressValidation';
import { parseTokenAmount } from './utils/tokenUtils';
import { isSolanaNetwork } from './utils/networkUtils';
import type { TokenInfo } from '../../token/src/types';
import { defaultTokens } from '../../token/src/data/defaultTokens';

export interface SwapToolConfig extends IToolConfig {
  defaultSlippage?: number;
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

// Simplified StructuredError interface
interface StructuredError {
  step: string; // Specific step where error occurred
  message: string; // Concise error message
  details: Record<string, any>; // Error details
}

export class SwapTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultSlippage: number;
  // private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: SwapToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultSlippage = config.defaultSlippage || 0.5;
    // this.defaultNetwork = config.defaultNetwork || 'bnb';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);
  }

  registerProvider(provider: ISwapProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'swap';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    let description = `The SwapTool enables users to exchange one cryptocurrency token for another using various Decentralized Exchange (DEX) 
    providers across supported blockchain networks. This tool facilitates token swaps, 
    allowing users to specify either the input amount (the amount they wish to spend, if amount is percent, must get balance before swap). 
    or the output amount (the amount they wish to receive). Supported networks include ${networks}.
    Do not reasoning about Token information. If user want to do action with token A, you would take actions on token A. 
    Providers include ${providers}.`;

    // Add provider-specific prompts if they exist
    const providerPrompts = this.registry
      .getProviders()
      .map((provider: ISwapProvider) => {
        const prompt = provider.getPrompt?.();
        return prompt ? `${provider.getName()}: ${prompt}` : null;
      })
      .filter((prompt: unknown): prompt is string => !!prompt);

    if (providerPrompts.length > 0) {
      description += '\n\nProvider-specific information:\n' + providerPrompts.join('\n');
    }

    return description;
  }

  private getSupportedNetworks(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No swap providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      fromToken: z.string().describe(`The adress of source token on network. (spend)`),
      toToken: z.string().describe(`The adress of destination token on network. (receive)`),
      amount: z.string().describe('The amount of tokens to swap'),
      amountType: z
        .enum(['input', 'output'])
        .describe('Whether the amount is input (spend) or output (receive)'),
      network: z.enum([
        'bnb',
        'solana',
        'ethereum',
        'arbitrum',
        'base',
        'optimism',
        'polygon',
        'null',
      ]).describe(`Determine blockchain network from user input. 
        Priority rules:
          1. Use explicitly mentioned network
          2. Infer from native tokens (ETH→Ethereum, SOL→Solana)
          3. For cross-chain mentions, determine main network
          4. Return null if no network detected`),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The DEX provider to use for the swap. If not specified, the best rate will be found',
        ),
      slippage: z
        .number()
        .optional()
        .describe(`Maximum slippage percentage allowed (default: ${this.defaultSlippage})`),
    });
  }

  private async findBestQuote(
    params: SwapParams & { network: string },
    userAddress: string,
  ): Promise<{ provider: ISwapProvider; quote: SwapQuote }> {
    // Validate network is supported
    const providers = this.registry.getProvidersByNetwork(params.network);
    if (providers.length === 0) {
      throw new Error(`No providers available for network ${params.network}`);
    }

    const quotes = await Promise.all(
      providers.map(async (provider: ISwapProvider) => {
        try {
          console.log('🤖 Getting quote from', provider.getName());
          const quote = await provider.getQuote(params, userAddress);
          return { provider, quote };
        } catch (error: any) {
          console.warn(`Failed to get quote from ${provider.getName()}:`, error);
          return null;
        }
      }),
    );

    type QuoteResult = { provider: ISwapProvider; quote: SwapQuote };
    const validQuotes = quotes.filter((q): q is QuoteResult => q !== null);
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found');
    }

    // Find the best quote based on amount type
    return validQuotes.reduce((best: QuoteResult, current: QuoteResult) => {
      if (params.type === 'input') {
        // For input amount, find highest output amount
        const bestAmount = BigInt(Number(best.quote.toAmount) * 10 ** best.quote.toToken.decimals);
        const currentAmount = BigInt(
          Number(current.quote.toAmount) * 10 ** current.quote.toToken.decimals,
        );
        return currentAmount > bestAmount ? current : best;
      } else {
        // For output amount, find lowest input amount
        const bestAmount = BigInt(
          Number(best.quote.fromAmount) * 10 ** best.quote.fromToken.decimals,
        );
        const currentAmount = BigInt(
          Number(current.quote.fromAmount) * 10 ** current.quote.fromToken.decimals,
        );
        return currentAmount < bestAmount ? current : best;
      }
    }, validQuotes[0]);
  }

  createTool(): CustomDynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
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
          const {
            fromToken,
            toToken,
            amount,
            amountType,
            network,
            provider: preferredProvider,
            slippage = this.defaultSlippage,
          } = args;

          console.log('🔄 Doing swap operation...');
          console.log('🤖 Swap Args:', args);

          // STEP 1: Validate network
          const supportedNetworks = this.getSupportedNetworks();
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

          // STEP 2: Validate token addresses
          if (!validateTokenAddress(fromToken, network)) {
            throw {
              step: 'token_validation',
              message: `Invalid fromToken address for network ${network}: ${fromToken}`,
              details: {
                token: fromToken,
                network: network,
                tokenType: 'fromToken',
              },
            } as StructuredError;
          }

          if (!validateTokenAddress(toToken, network)) {
            throw {
              step: 'token_validation',
              message: `Invalid toToken address for network ${network}: ${toToken}`,
              details: {
                token: toToken,
                network: network,
                tokenType: 'toToken',
              },
            } as StructuredError;
          }

          // STEP 3: Get wallet address
          let userAddress;
          try {
            // Get agent's wallet and address
            const wallet = this.agent.getWallet();
            userAddress = await wallet.getAddress(network);
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

          const swapParams: SwapParams = {
            network,
            fromToken,
            toToken,
            amount,
            type: amountType,
            slippage,
          };

          let selectedProvider: ISwapProvider;
          let quote: SwapQuote;

          onProgress?.({
            progress: 0,
            message: 'Searching for the best exchange rate for your swap.',
          });

          // STEP 4: Get provider and quote
          try {
            if (preferredProvider) {
              selectedProvider = this.registry.getProvider(preferredProvider);

              // Validate provider supports the network
              if (!selectedProvider.getSupportedNetworks().includes(network)) {
                throw {
                  step: 'provider_network_compatibility',
                  message: `Provider ${preferredProvider} does not support network ${network}.`,
                  details: {
                    provider: preferredProvider,
                    requestedNetwork: network,
                    providerSupportedNetworks: selectedProvider.getSupportedNetworks(),
                  },
                } as StructuredError;
              }

              try {
                quote = await selectedProvider.getQuote(swapParams, userAddress);
              } catch (error: any) {
                throw {
                  step: 'quote_retrieval',
                  message: `Failed to get quote from provider ${preferredProvider}.`,
                  details: {
                    provider: preferredProvider,
                    network: network,
                    fromToken: fromToken,
                    toToken: toToken,
                    error: error instanceof Error ? error.message : String(error),
                  },
                } as StructuredError;
              }
            } else {
              try {
                const bestQuote = await this.findBestQuote(
                  {
                    ...swapParams,
                    network,
                  },
                  userAddress,
                );
                selectedProvider = bestQuote.provider;
                quote = bestQuote.quote;
              } catch (error: any) {
                throw {
                  step: 'best_quote_search',
                  message: `Failed to find any valid quotes for your swap.`,
                  details: {
                    network: network,
                    fromToken: fromToken,
                    toToken: toToken,
                    error: error instanceof Error ? error.message : String(error),
                  },
                } as StructuredError;
              }
            }
          } catch (error: any) {
            if ('step' in error) {
              throw error; // Re-throw structured errors
            }

            console.warn(`Failed to get quote:`, error);
            throw {
              step: 'quote_retrieval',
              message: `Failed to get a quote for your swap.`,
              details: {
                network: network,
                fromToken: fromToken,
                toToken: toToken,
                error: error instanceof Error ? error.message : String(error),
              },
            } as StructuredError;
          }

          console.log('🤖 The selected provider is:', selectedProvider.getName());

          onProgress?.({
            progress: 10,
            message: `Verifying you have sufficient ${quote.fromToken.symbol || 'tokens'} for this swap.`,
          });

          // STEP 5: Check balance
          try {
            const balanceCheck = await selectedProvider.checkBalance(quote, userAddress);
            if (!balanceCheck.isValid) {
              throw {
                step: 'balance_check',
                message: balanceCheck.message || 'Insufficient balance for swap',
                details: {
                  network: network,
                  fromToken: quote.fromToken.symbol || fromToken,
                  requiredAmount: quote.fromAmount,
                  userAddress: userAddress,
                },
              } as StructuredError;
            }
          } catch (error: any) {
            if ('step' in error) {
              throw error; // Re-throw structured errors
            }

            throw {
              step: 'balance_check',
              message: `Failed to verify your token balance.`,
              details: {
                network: network,
                fromToken: quote.fromToken.symbol || fromToken,
                error: error instanceof Error ? error.message : String(error),
              },
            } as StructuredError;
          }

          onProgress?.({
            progress: 20,
            message: `Preparing to swap ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for approximately ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}.`,
          });

          // STEP 6: Build swap transaction
          let swapTx;
          try {
            swapTx = await selectedProvider.buildSwapTransaction(quote, userAddress);
          } catch (error: any) {
            throw {
              step: 'transaction_build',
              message: `Failed to build the swap transaction.`,
              details: {
                provider: selectedProvider.getName(),
                network: network,
                fromToken: quote.fromToken.symbol || fromToken,
                toToken: quote.toToken.symbol || toToken,
                error: error instanceof Error ? error.message : String(error),
              },
            } as StructuredError;
          }

          onProgress?.({
            progress: 40,
            message: `Checking allowance... Verifying if approval is needed for ${selectedProvider.getName()} to access your ${quote.fromToken.symbol || 'tokens'}.`,
          });

          // STEP 7: Handle token approval (for EVM chains)
          if (!isSolanaNetwork(network)) {
            try {
              // Check if approval is needed and handle it
              const allowance = await selectedProvider.checkAllowance(
                network,
                quote.fromToken.address,
                userAddress,
                swapTx.spender,
              );

              const requiredAmount = parseTokenAmount(quote.fromAmount, quote.fromToken.decimals);

              console.log('🤖 Allowance: ', allowance, ' Required amount: ', requiredAmount);

              if (allowance < requiredAmount) {
                try {
                  const approveTx = await selectedProvider.buildApproveTransaction(
                    network,
                    quote.fromToken.address,
                    swapTx.spender,
                    quote.fromAmount,
                    userAddress,
                  );

                  console.log('🤖 Approving...');
                  // Sign and send approval transaction
                  onProgress?.({
                    progress: 60,
                    message: `Approving ${selectedProvider.getName()} to access your ${quote.fromToken.symbol || 'tokens'}`,
                  });

                  const wallet = this.agent.getWallet();
                  const approveReceipt = await wallet.signAndSendTransaction(network, {
                    to: approveTx.to,
                    data: approveTx.data,
                    value: BigInt(approveTx.value),
                  });

                  console.log('🤖 ApproveReceipt:', approveReceipt);

                  // Wait for approval to be mined
                  await approveReceipt.wait();
                } catch (error: any) {
                  throw {
                    step: 'token_approval',
                    message: `Failed to approve token spending.`,
                    details: {
                      network: network,
                      fromToken: quote.fromToken.symbol || fromToken,
                      spender: swapTx.spender,
                      error: error instanceof Error ? error.message : String(error),
                    },
                  } as StructuredError;
                }
              }
            } catch (error: any) {
              if ('step' in error) {
                throw error; // Re-throw structured errors
              }

              throw {
                step: 'allowance_check',
                message: `Failed to check token allowance.`,
                details: {
                  network: network,
                  fromToken: quote.fromToken.symbol || fromToken,
                  error: error instanceof Error ? error.message : String(error),
                },
              } as StructuredError;
            }
          }

          console.log('🤖 Swapping...');

          onProgress?.({
            progress: 80,
            message: `Swapping ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for approximately ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} with ${slippage}% max slippage.`,
          });

          console.log('🤖 swapTx', swapTx);

          // STEP 8: Execute swap transaction
          let receipt;
          let finalReceipt;
          try {
            // Sign and send swap transaction
            const wallet = this.agent.getWallet();
            receipt = await wallet.signAndSendTransaction(network, {
              to: swapTx.to,
              data: swapTx.data,
              value: BigInt(swapTx.value),
            });

            // Wait for transaction to be mined
            finalReceipt = await receipt?.wait();
          } catch (error: any) {
            throw {
              step: 'transaction_execution',
              message: `Failed to execute the swap transaction.`,
              details: {
                network: network,
                fromToken: quote.fromToken.symbol || fromToken,
                toToken: quote.toToken.symbol || toToken,
                error: error instanceof Error ? error.message : String(error),
              },
            } as StructuredError;
          }

          try {
            // Clear token balance caches after successful swap
            selectedProvider.invalidateBalanceCache(quote.fromToken.address, userAddress, network);
            selectedProvider.invalidateBalanceCache(quote.toToken.address, userAddress, network);
          } catch (error: any) {
            console.error('Error clearing token balance caches:', error);
            // Non-critical error, don't throw
          }

          onProgress?.({
            progress: 100,
            message: `Swap complete! Successfully swapped ${quote.fromAmount} ${quote.fromToken.symbol || 'tokens'} for ${quote.toAmount} ${quote.toToken.symbol || 'tokens'} via ${selectedProvider.getName()}. Transaction hash: ${finalReceipt.hash}`,
          });

          // Return result as JSON string
          return JSON.stringify({
            status: 'success',
            provider: selectedProvider.getName(),
            fromToken: quote.fromToken,
            toToken: quote.toToken,
            fromAmount: quote.fromAmount.toString(),
            toAmount: quote.toAmount.toString(),
            transactionHash: finalReceipt.hash,
            priceImpact: quote.priceImpact,
            type: quote.type,
            network,
          });
        } catch (error: any) {
          console.error('Swap error:', error);

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

              // Special handling for token_validation
              if (errorStep === 'token_validation' && !args._attempt) {
                return await this.attemptTokenAddressFix(args, structuredError);
              }
            } else if (error instanceof Error) {
              // Handle standard Error objects
              errorStep = 'execution';
              errorMessage = error.message;

              // Check if this is a token address error that we can try to fix
              if (
                (error.message.includes('Invalid fromToken address') ||
                  error.message.includes('Invalid toToken address')) &&
                !args._attempt
              ) {
                return await this.attemptTokenAddressFix(args, error);
              }

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

            // Create suggestion for primitive error
            const mockPrimitiveError: StructuredError = {
              step: errorStep,
              message: errorMessage,
              details: { error: errorMessage, network: args.network },
            };
            suggestion = this.generateEnhancedSuggestion(errorStep, mockPrimitiveError, args);
          }

          // Return structured error response with enhanced information
          return JSON.stringify({
            status: 'error',
            tool: 'swap',
            toolType: 'cryptocurrency_exchange',
            process: 'token_swap',
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

  // Helper method to attempt fixing token addresses
  private async attemptTokenAddressFix(args: any, error: any): Promise<string> {
    console.log('🔍 Fixing token addresses in Swap...');

    // Determine which token has the error
    const isFromTokenAddressError =
      error.message?.includes('Invalid fromToken address') ||
      error.details?.tokenType === 'fromToken';
    const isToTokenAddressError =
      error.message?.includes('Invalid toToken address') || error.details?.tokenType === 'toToken';

    // Add type assertion for args.network to match the NetworkName type
    const tokenInfos = defaultTokens[args.network as keyof typeof defaultTokens] as
      | Record<string, TokenInfo>
      | undefined;

    // Add null check for tokenInfos
    if (!tokenInfos) {
      console.log(`❌ No token information found for network ${args.network}`);
      return JSON.stringify({
        status: 'error',
        tool: 'swap',
        errorStep: 'token_lookup',
        message: `No token information found for network ${args.network}`,
        suggestion: `Please verify the network name and try again with a supported network.`,
        parameters: args,
      });
    }

    let updatedArgs = { ...args, _attempt: true };
    let foundCorrectAddress = false;

    // Attempt to fix token addresses
    if (isFromTokenAddressError) {
      for (const [address, tokenInfo] of Object.entries(tokenInfos) as [string, TokenInfo][]) {
        if (tokenInfo.symbol.toLowerCase() === args.fromToken.toLowerCase()) {
          console.log(`🔍 Found correct address for ${args.fromToken}: ${address}`);
          updatedArgs.fromToken = address;
          foundCorrectAddress = true;
          break;
        }
      }
    }

    if (isToTokenAddressError) {
      for (const [address, tokenInfo] of Object.entries(tokenInfos) as [string, TokenInfo][]) {
        if (tokenInfo.symbol.toLowerCase() === args.toToken.toLowerCase()) {
          console.log(`🔍 Found correct address for ${args.toToken}: ${address}`);
          updatedArgs.toToken = address;
          foundCorrectAddress = true;
          break;
        }
      }
    }

    // Retry the operation with corrected addresses if found
    if (foundCorrectAddress) {
      console.log('🔄 Retrying with corrected token address...');
      try {
        const result = await this.createTool().func(updatedArgs);
        return result;
      } catch (retryError) {
        console.error('Error during retry:', retryError);
        return JSON.stringify({
          status: 'error',
          tool: 'swap',
          errorStep: 'token_correction_retry',
          message: retryError instanceof Error ? retryError.message : String(retryError),
          suggestion: `We attempted to correct the token address but the swap still failed. Please verify both token addresses and try again.`,
          parameters: updatedArgs,
        });
      }
    } else {
      // If we couldn't find a matching token symbol
      return JSON.stringify({
        status: 'error',
        tool: 'swap',
        errorStep: 'token_address_correction',
        message: `Could not find a valid address for the token symbol.`,
        suggestion: `Please provide valid token addresses for the ${args.network} network instead of symbols, or check if the token exists on this network.`,
        parameters: args,
      });
    }
  }

  // Simplified suggestion generator function
  private generateEnhancedSuggestion(
    errorStep: string,
    structuredError: StructuredError,
    args: any,
  ): string {
    let suggestion = '';
    let alternativeActions: string[] = [];

    // Prefix to clearly indicate this is a SwapTool error
    const errorPrefix = `[SwapTool Error] `;

    switch (errorStep) {
      case 'network_validation':
        const networks = structuredError.details.supportedNetworks || [];
        suggestion = `${errorPrefix}Network validation failed: "${structuredError.details.requestedNetwork}" is not supported for token swapping. Please use one of these networks: ${networks.join(', ')}.`;

        alternativeActions = [
          `Try with a supported network, e.g., "swap 10 USDT to BNB on bnb"`,
          `Check token information on a different network: "get token info for USDT on bnb"`,
        ];
        break;

      case 'token_validation':
        const tokenType = structuredError.details.tokenType;
        const tokenSymbol = structuredError.details.token;
        const network = structuredError.details.network;

        suggestion = `${errorPrefix}Token validation failed: The ${tokenType} "${tokenSymbol}" is not valid on the ${network} network. You may have entered a token symbol instead of an address, or the address format is incorrect.`;

        alternativeActions = [
          `Find accurate token information: "get token info for ${tokenSymbol} on ${network}"`,
          `Check your wallet balance: "check my balance on ${network}"`,
          `Use the correct token address: "swap [token_address] to [token_address] on ${network}"`,
        ];
        break;

      case 'wallet_address':
        suggestion = `${errorPrefix}Wallet access failed: Could not access wallet address for the ${structuredError.details.network} network. Please ensure your wallet is properly connected and supports this network.`;

        alternativeActions = [
          `Check your wallet: "show my wallet addresses"`,
          `Check your balance: "check my balance on ${structuredError.details.network}"`,
          `Try a different network: "swap ... on [different_network]"`,
        ];
        break;

      case 'provider_network_compatibility':
        const provider = structuredError.details.provider;
        const supportedNets = structuredError.details.providerSupportedNetworks || [];

        suggestion = `${errorPrefix}Provider compatibility issue: The swap provider "${provider}" does not support the ${structuredError.details.requestedNetwork} network. This provider only supports: ${supportedNets.join(', ')}.`;

        alternativeActions = [
          `Try without specifying a provider: "swap ${args.fromToken} to ${args.toToken} on ${args.network}"`,
          `Use a supported network: "swap ${args.fromToken} to ${args.toToken} on ${supportedNets[0] || 'supported_network'}"`,
        ];
        break;

      case 'quote_retrieval':
      case 'best_quote_search':
        const fromTokenSymbol = structuredError.details.fromToken;
        const toTokenSymbol = structuredError.details.toToken;

        suggestion = `${errorPrefix}Price quote failed: Could not get a swap quote for ${fromTokenSymbol} to ${toTokenSymbol} on the ${structuredError.details.network} network. This may be due to insufficient liquidity, non-existent tokens, or no trading pair.`;

        alternativeActions = [
          `Check token information: "get token info for ${fromTokenSymbol} on ${structuredError.details.network}"`,
          `Try with a different amount: "swap smaller amount of ${fromTokenSymbol} to ${toTokenSymbol}"`,
          `Try a different token pair: "swap ${fromTokenSymbol} to [different_token] on ${structuredError.details.network}"`,
        ];
        break;

      case 'balance_check':
        suggestion = `${errorPrefix}Insufficient balance: You don't have enough ${structuredError.details.fromToken} for this swap. Please check your balance and try with a smaller amount.`;

        alternativeActions = [
          `Check your balance: "check my balance on ${structuredError.details.network}"`,
          `Try with a smaller amount: "swap smaller amount of ${structuredError.details.fromToken} to ${args.toToken}"`,
        ];
        break;

      case 'transaction_build':
        suggestion = `${errorPrefix}Transaction creation failed: Could not create the swap transaction. This could be due to insufficient liquidity or an issue with the selected provider (${structuredError.details.provider}).`;

        alternativeActions = [
          `Try with a different provider: "swap ${structuredError.details.fromToken} to ${structuredError.details.toToken} using [different_provider]"`,
          `Try with a smaller amount: "swap smaller amount of ${structuredError.details.fromToken} to ${structuredError.details.toToken}"`,
        ];
        break;

      case 'allowance_check':
        suggestion = `${errorPrefix}Allowance check failed: Could not verify token approval status for ${structuredError.details.fromToken}. Please ensure you have enough native currency for gas fees and try again.`;

        alternativeActions = [
          `Check your native token balance: "check my balance of native token on ${structuredError.details.network}"`,
        ];
        break;

      case 'token_approval':
        suggestion = `${errorPrefix}Token approval failed: Could not approve ${structuredError.details.fromToken} for trading. Please ensure you have enough native currency for gas fees and try again.`;

        alternativeActions = [
          `Check your native token balance: "check my balance of native token on ${structuredError.details.network}"`,
        ];
        break;

      case 'transaction_execution':
        suggestion = `${errorPrefix}Transaction execution failed: The swap transaction could not be completed. This could be due to price movement, insufficient gas, or network congestion. Please try again with a higher slippage tolerance.`;

        alternativeActions = [
          `Try with higher slippage: "swap ${args.fromToken} to ${args.toToken} with 1% slippage"`,
        ];
        break;

      case 'token_address_correction':
        suggestion = `${errorPrefix}Token address correction failed: Could not find a valid address for the token symbol. Please provide valid token addresses for the ${args.network} network instead of symbols, or check if the token exists on this network.`;

        alternativeActions = [
          `Find token information: "search for ${args.fromToken} token on ${args.network}"`,
          `List popular tokens: "list popular tokens on ${args.network}"`,
        ];
        break;

      default:
        suggestion = `${errorPrefix}Swap operation failed: An unexpected error occurred during the swap process. Please check your input parameters and try again. Make sure you're using valid networks, tokens, and amounts.`;

        alternativeActions = [
          `Check token information: "get token info for ${args.fromToken || 'token'} on ${args.network || 'network'}"`,
          `Check your balance: "check my balance on ${args.network || 'network'}"`,
        ];
    }

    // Create enhanced suggestion with alternative actions
    let enhancedSuggestion = `${suggestion}\n\n`;

    // Add process information
    enhancedSuggestion += `**Swap Process Stage:** ${errorStep.replace('_', ' ').charAt(0).toUpperCase() + errorStep.replace('_', ' ').slice(1)}\n\n`;

    // Add alternative actions
    if (alternativeActions.length > 0) {
      enhancedSuggestion += `**Suggested commands you can try:**\n`;
      alternativeActions.forEach(action => {
        enhancedSuggestion += `- ${action}\n`;
      });
    }

    return enhancedSuggestion;
  }
}
