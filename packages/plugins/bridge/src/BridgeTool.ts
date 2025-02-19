import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IBridgeProvider, BridgeQuote, BridgeParams } from './types';

export interface BridgeToolConfig extends IToolConfig {
  defaultSlippage?: number;
  defaultChain?: string;
  supportedChains?: string[];
}

export class BridgeTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultSlippage: number;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: BridgeToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultSlippage = config.defaultSlippage || 0.5;
    this.defaultChain = config.defaultChain || 'solana';
    this.supportedChains = new Set<string>(config.supportedChains || []);
    console.log('BridgeTool constructor', this.defaultChain);
  }

  registerProvider(provider: IBridgeProvider): void {
    this.registry.registerProvider(provider);
    // Add provider's supported chains
    provider.getSupportedChains().forEach((chain) => {
      this.supportedChains.add(chain);
    });
  }

  getName(): string {
    return 'bridge';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    return `Bridge tokens using various DEX providers (${providers}). Supports chains: ${chains}. You can specify either input amount (how much to spend) or output amount (how much to receive).`;
  }

  private getSupportedChains(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported chains from providers
    const providerChains = Array.from(this.supportedChains);

    // Return intersection of agent networks and provider supported chains
    return agentNetworks.filter((network) => providerChains.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No bridge providers registered');
    }

    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    return z.object({
      fromChain: z.string().describe('The chain to bridge from'),
      toChain: z.string().describe('The chain to bridge to'),
      wallet: z.string().describe('The wallet address to bridge'),
      walletReceive: z.string().describe('The wallet receive address'),
      fromToken: z
        .string()
        .describe('The token address or symbol to bridge from'),
      token: z.string().describe('The token address or symbol to bridge'),
      toToken: z
        .string()
        .describe(
          'The token address or symbol to bridge to on the destination chain',
        ),
      amount: z.string().describe('The amount of tokens to bridge'),
      amountType: z
        .enum(['input', 'output'])
        .describe('Whether the amount is input (spend) or output (receive)'),
      chain: z
        .enum(supportedChains as [string, ...string[]])
        .default(this.defaultChain)
        .describe('The blockchain to execute the bridge on'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The DEX provider to use for the bridge. If not specified, the best rate will be found',
        ),
      slippage: z
        .number()
        .optional()
        .describe(
          `Maximum slippage percentage allowed (default: ${this.defaultSlippage})`,
        ),
    });
  }

  private async findBestQuote(
    params: BridgeParams & { chain: string },
  ): Promise<{ provider: IBridgeProvider; quote: BridgeQuote }> {
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
          console.warn(
            `Failed to get quote from ${provider.getName()}:`,
            error,
          );
          return null;
        }
      }),
    );

    const validQuotes = quotes.filter(
      (q): q is NonNullable<typeof q> => q !== null,
    );
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found');
    }

    // Find the best quote based on amount type
    return validQuotes.reduce((best, current) => {
      if (params.type === 'input') {
        // For input amount, find highest output amount
        const bestAmount = BigInt(best.quote.amount);
        const currentAmount = BigInt(current.quote.amount);
        return currentAmount > bestAmount ? current : best;
      } else {
        // For output amount, find lowest input amount
        const bestAmount = BigInt(best.quote.amount);
        const currentAmount = BigInt(current.quote.amount);
        return currentAmount < bestAmount ? current : best;
      }
    }, validQuotes[0]);
  }

  createTool(): DynamicStructuredTool {
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args) => {
        try {
          const {
            fromChain,
            toChain,
            token,
            amount,
            type: amountType,
            chain = this.defaultChain,
            provider: preferredProvider,
            slippage = this.defaultSlippage,
            //wallet, // wallet
            walletReceive, // walletReceive
          } = args;
          // Get agent's wallet and address
          const wallet = this.agent.getWallet();
          const userAddress = await wallet.getAddress(chain);
          console.log("🚀 ~ BridgeTool ~ func: ~ userAddress:", userAddress)

          // Validate chain is supported
          const supportedChains = this.getSupportedChains();
          if (!supportedChains.includes(chain)) {
            throw new Error(
              `Chain ${chain} is not supported. Supported chains: ${supportedChains.join(
                ', ',
              )}`,
            );
          }

          const bridgeParams: BridgeParams = {
            fromChain, // fromChain
            toChain, // toChain
            token, // token
            amount, // amount
            type: amountType, // type
            slippage, // slippage
            wallet: userAddress, // wallet
            walletReceive, // walletReceive
          };
          console.log("🚀 ~ BridgeTool ~ func: ~ bridgeParams:", bridgeParams)

          let selectedProvider: IBridgeProvider;
          let quote: BridgeQuote;

          if (preferredProvider) {
            selectedProvider = this.registry.getProvider(preferredProvider);
            // Validate provider supports the chain
            if (!selectedProvider.getSupportedChains().includes(chain)) {
              throw new Error(
                `Provider ${preferredProvider} does not support chain ${chain}`,
              );
            }
            quote = await selectedProvider.getQuote(bridgeParams);
          } else {
            const bestQuote = await this.findBestQuote({
              ...bridgeParams,
              chain,
            });
            selectedProvider = bestQuote.provider;
            quote = bestQuote.quote;
          }

          // Build bridge transaction
          const bridgeTx = await selectedProvider.buildBridgeTransaction(
            quote,
            userAddress,
          );
          console.log("🚀 ~ BridgeTool ~ func: ~ bridgeTx:", bridgeTx)
          const receipt = await wallet.signAndSendTransaction(chain, bridgeTx );

          // Wait for transaction to be mined
          const finalReceipt = await receipt?.wait();

          //Return result as JSON string
          return JSON.stringify({
            provider: selectedProvider.getName(),
            fromToken: quote.fromToken,
            toToken: quote.toToken,
            amount: quote.amount.toString(),
            transactionHash: finalReceipt?.hash,
            priceImpact: quote.priceImpact,
            type: quote.type,
            chain,
          });
        } catch (error) {
          console.error('🚀 ~ BridgeTool ~ func: ~ error:', error);
        }
      },
    });
  }
}