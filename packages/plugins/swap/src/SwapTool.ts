import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ISwapProvider, SwapQuote, SwapParams } from './types';

export interface SwapToolConfig extends IToolConfig {
  defaultSlippage?: number;
  defaultChain?: string;
  supportedChains?: string[];
}

export class SwapTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultSlippage: number;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: SwapToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultSlippage = config.defaultSlippage || 0.5;
    this.defaultChain = config.defaultChain || 'bnb';
    this.supportedChains = new Set<string>(config.supportedChains || []);
  }

  registerProvider(provider: ISwapProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  getName(): string {
    return 'swap';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    return `Swap tokens using various DEX providers (${providers}). Supports chains: ${chains}. You can specify either input amount (how much to spend) or output amount (how much to receive).`;
  }

  private getSupportedChains(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());
    
    // Intersect with supported chains from providers
    const providerChains = Array.from(this.supportedChains);
    
    // Return intersection of agent networks and provider supported chains
    return agentNetworks.filter(network => 
      providerChains.includes(network)
    );
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No swap providers registered');
    }

    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    return z.object({
      fromToken: z.string().describe('The token address or symbol to swap from'),
      toToken: z.string().describe('The token address or symbol to swap to'),
      amount: z.string().describe('The amount of tokens to swap'),
      amountType: z.enum(['input', 'output']).describe('Whether the amount is input (spend) or output (receive)'),
      chain: z.enum(supportedChains as [string, ...string[]]).default(this.defaultChain)
        .describe('The blockchain to execute the swap on'),
      provider: z.enum(providers as [string, ...string[]]).optional()
        .describe('The DEX provider to use for the swap. If not specified, the best rate will be found'),
      slippage: z.number().optional()
        .describe(`Maximum slippage percentage allowed (default: ${this.defaultSlippage})`),
    });
  }

  private async findBestQuote(params: SwapParams & { chain: string }): Promise<{ provider: ISwapProvider; quote: SwapQuote }> {
    // Validate chain is supported
    const providers = this.registry.getProvidersByChain(params.chain);
    if (providers.length === 0) {
      throw new Error(`No providers available for chain ${params.chain}`);
    }

    const quotes = await Promise.all(
      providers.map(async (provider) => {
        try {
          const quote = await provider.getQuote(params);
          return { provider, quote };
        } catch (error) {
          console.warn(`Failed to get quote from ${provider.getName()}:`, error);
          return null;
        }
      })
    );

    const validQuotes = quotes.filter((q): q is NonNullable<typeof q> => q !== null);
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found');
    }

    // Find the best quote based on amount type
    return validQuotes.reduce((best, current) => {
      if (params.type === 'input') {
        // For input amount, find highest output amount
        const bestAmount = BigInt(best.quote.toAmount);
        const currentAmount = BigInt(current.quote.toAmount);
        return currentAmount > bestAmount ? current : best;
      } else {
        // For output amount, find lowest input amount
        const bestAmount = BigInt(best.quote.fromAmount);
        const currentAmount = BigInt(current.quote.fromAmount);
        return currentAmount < bestAmount ? current : best;
      }
    }, validQuotes[0]);
  }

  createTool(): DynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args) => {
        const {
          fromToken,
          toToken,
          amount,
          amountType,
          chain = this.defaultChain,
          provider: preferredProvider,
          slippage = this.defaultSlippage,
        } = args;

        // Get agent's wallet and address
        const wallet = this.agent.getWallet();
        const userAddress = await wallet.getAddress(chain);

        // Validate chain is supported
        const supportedChains = this.getSupportedChains();
        if (!supportedChains.includes(chain)) {
          throw new Error(`Chain ${chain} is not supported. Supported chains: ${supportedChains.join(', ')}`);
        }

        const swapParams: SwapParams = {
          fromToken,
          toToken,
          amount,
          type: amountType,
          slippage,
        };

        let selectedProvider: ISwapProvider;
        let quote: SwapQuote;

        if (preferredProvider) {
          selectedProvider = this.registry.getProvider(preferredProvider);
          // Validate provider supports the chain
          if (!selectedProvider.getSupportedChains().includes(chain)) {
            throw new Error(`Provider ${preferredProvider} does not support chain ${chain}`);
          }
          quote = await selectedProvider.getQuote(swapParams);
        } else {
          const bestQuote = await this.findBestQuote({
            ...swapParams,
            chain,
          });
          selectedProvider = bestQuote.provider;
          quote = bestQuote.quote;
        }

        // Build swap transaction
        const swapTx = await selectedProvider.buildSwapTransaction(quote, userAddress);

        // Check if approval is needed and handle it
        const allowance = await selectedProvider.checkAllowance(
          quote.fromToken,
          userAddress,
          swapTx.to
        );
        const requiredAmount = BigInt(quote.fromAmount);

        if (allowance < requiredAmount) {
          const approveTx = await selectedProvider.buildApproveTransaction(
            quote.fromToken,
            swapTx.to,
            quote.fromAmount,
            userAddress
          );

          // Sign and send approval transaction
          const approveReceipt = await wallet.signAndSendTransaction(chain, {
            to: approveTx.to,
            data: approveTx.data,
            value: BigInt(approveTx.value),
            gasLimit: BigInt(approveTx.gasLimit),
          });

          // Wait for approval to be mined
          await approveReceipt.wait();
        }

        // Sign and send swap transaction
        const receipt = await wallet.signAndSendTransaction(chain, {
          to: swapTx.to,
          data: swapTx.data,
          value: BigInt(swapTx.value),
          gasLimit: BigInt(swapTx.gasLimit),
        });

        // Wait for transaction to be mined
        const finalReceipt = await receipt.wait();

        // Return result as JSON string
        return JSON.stringify({
          provider: selectedProvider.getName(),
          fromToken: quote.fromToken,
          toToken: quote.toToken,
          fromAmount: quote.fromAmount.toString(),
          toAmount: quote.toAmount.toString(),
          transactionHash: finalReceipt.hash,
          priceImpact: quote.priceImpact,
          type: quote.type,
          chain,
        });
      },
    });
  }
} 