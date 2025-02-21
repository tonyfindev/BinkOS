import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig, Agent } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { BridgeConfig, BridgeQuote, BridgeTransaction, BridgeProvider } from './types';

export interface BridgeToolConfig extends IToolConfig {
  defaultChain?: string;
  supportedChains?: string[];
}

export class BridgeTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: BridgeToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultChain = config.defaultChain || 'bnb';
    this.supportedChains = new Set<string>(config.supportedChains || []);
  }

  registerProvider(provider: BridgeProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain.toString());
    });
  }

  getName(): string {
    return 'bridge';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    return `Bridge tokens across different chains using various providers (${providers}). Supports chains: ${chains}.`;
  }

  private getSupportedChains(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported chains from providers
    const providerChains = Array.from(this.supportedChains);

    // Return intersection of agent networks and provider supported chains
    return agentNetworks.filter(network => providerChains.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    // Base schema for bridge parameters
    const baseSchema = z.object({
      fromChain: z
        .enum(supportedChains as [string, ...string[]])
        .default(this.defaultChain)
        .describe('The source chain to bridge from'),
      toChain: z
        .enum(supportedChains as [string, ...string[]])
        .describe('The destination chain to bridge to'),
      tokenAddress: z.string().describe('The token address to bridge'),
      amount: z.string().describe('The amount of tokens to bridge'),
      recipient: z
        .string()
        .optional()
        .describe('Optional recipient address. If not provided, sender address will be used'),
    });

    return baseSchema;
  }

  private async findBestQuote(
    params: BridgeConfig,
  ): Promise<{ provider: BridgeProvider; quote: BridgeQuote }> {
    // Get providers that support both chains
    const providers = this.registry
      .getProvidersByChain(params.fromChain)
      .filter(provider => provider.getSupportedChains().includes(params.toChain));

    if (providers.length === 0) {
      throw new Error(
        `No providers available for chain pair ${params.fromChain}-${params.toChain}`,
      );
    }

    const quotes = await Promise.all(
      providers.map(async provider => {
        try {
          console.log('🤖 Getting quote from', provider.getName());
          const quote = await provider.getQuote(params);
          return { provider, quote };
        } catch (error) {
          console.warn(`Failed to get quote from ${provider.getName()}:`, error);
          return null;
        }
      }),
    );

    const validQuotes = quotes.filter((q): q is NonNullable<typeof q> => q !== null);
    if (validQuotes.length === 0) {
      throw new Error('No valid quotes found');
    }

    // Find the best quote based on output amount (after fees)
    return validQuotes.reduce((best, current) => {
      // Convert amounts to BigInt considering decimals
      const bestAmount = BigInt(Number(best.quote.toAmount) * 10 ** best.quote.toToken.decimals);
      const currentAmount = BigInt(
        Number(current.quote.toAmount) * 10 ** current.quote.toToken.decimals,
      );
      return currentAmount > bestAmount ? current : best;
    }, validQuotes[0]);
  }

  createTool(): DynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const { fromChain, toChain, tokenAddress, amount, recipient } = args;

          console.log('🤖 Bridge Args:', args);

          // Get agent's wallet and addresses for both chains
          const wallet = this.agent.getWallet();
          const [fromAddress, toAddress] = await Promise.all([
            wallet.getAddress(fromChain),
            wallet.getAddress(toChain),
          ]);
          const actualRecipient = recipient || toAddress;

          // Validate chains are supported
          const supportedChains = this.getSupportedChains();
          if (!supportedChains.includes(fromChain)) {
            throw new Error(
              `Source chain ${fromChain} is not supported. Supported chains: ${supportedChains.join(', ')}`,
            );
          }
          if (!supportedChains.includes(toChain)) {
            throw new Error(
              `Destination chain ${toChain} is not supported. Supported chains: ${supportedChains.join(', ')}`,
            );
          }

          const bridgeParams: BridgeConfig = {
            fromChain,
            toChain,
            tokenAddress,
            amount,
            recipient: actualRecipient,
          };

          // Find best quote
          const { provider, quote } = await this.findBestQuote(bridgeParams);

          console.log('🤖 Selected provider:', provider.getName());

          // Build bridge transaction
          const bridgeTx = await provider.buildBridgeTransaction(quote);

          // Check if approval is needed and handle it
          const allowance = await provider.checkAllowance(tokenAddress, fromAddress, bridgeTx.to);
          const requiredAmount = BigInt(Number(quote.fromAmount) * 10 ** quote.fromToken.decimals);

          if (allowance < requiredAmount) {
            console.log('🤖 Approving token...');
            const approveTx = await provider.buildApproveTransaction(
              tokenAddress,
              bridgeTx.to,
              quote.fromAmount,
              fromAddress,
            );

            // Sign and send approval transaction
            const approveReceipt = await wallet.signAndSendTransaction(fromChain, {
              to: approveTx.to,
              data: approveTx.data,
              value: BigInt(approveTx.value || '0'),
              gasLimit: BigInt(approveTx.gasLimit || '0'),
            });

            // Wait for approval to be mined
            await approveReceipt.wait();
          }

          console.log('🤖 Bridging tokens...');

          // Sign and send bridge transaction
          const receipt = await wallet.signAndSendTransaction(fromChain, {
            to: bridgeTx.to,
            data: bridgeTx.data,
            value: BigInt(bridgeTx.value || '0'),
            gasLimit: BigInt(bridgeTx.gasLimit || '0'),
          });

          // Wait for transaction to be mined
          const finalReceipt = await receipt.wait();

          return JSON.stringify({
            provider: provider.getName(),
            fromChain,
            toChain,
            token: tokenAddress,
            amount: amount,
            recipient: actualRecipient,
            fromAmount: quote.fromAmount,
            toAmount: quote.toAmount,
            bridgeFee: quote.bridgeFee,
            transactionHash: finalReceipt.hash,
          });
        } catch (error) {
          console.error('Bridge error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    });
  }
}
