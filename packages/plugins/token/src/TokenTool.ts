import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { BaseTool, IToolConfig } from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ITokenProvider, TokenInfo, TokenQueryParams } from './types';

export interface GetTokenInfoToolConfig extends IToolConfig {
  defaultChain?: string;
  supportedChains?: string[];
}

export class GetTokenInfoTool extends BaseTool {
  public registry: ProviderRegistry;
  private defaultChain: string;
  private supportedChains: Set<string>;

  constructor(config: GetTokenInfoToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.defaultChain = config.defaultChain || 'bnb';
    this.supportedChains = new Set<string>(config.supportedChains || []);
  }

  registerProvider(provider: ITokenProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered', provider.constructor.name);
    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  getName(): string {
    return 'getTokenInfo';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const chains = Array.from(this.supportedChains).join(', ');
    return `Query token information using various providers (${providers}). Supports chains: ${chains}. You can query by token address or symbol.`;
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
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No token providers registered');
    }

    const supportedChains = this.getSupportedChains();
    if (supportedChains.length === 0) {
      throw new Error('No supported chains available');
    }

    return z.object({
      query: z.string().describe('The token address or symbol to query'),
      chain: z
        .enum(supportedChains as [string, ...string[]])
        .default(this.defaultChain)
        .describe('The blockchain to query the token on'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The provider to use for querying. If not specified, all available providers will be tried',
        ),
      includePrice: z
        .boolean()
        .optional()
        .default(true)
        .describe('Whether to include price information in the response'),
    });
  }

  private async queryToken(params: TokenQueryParams & { chain: string }): Promise<TokenInfo> {
    // Validate chain is supported
    const providers = this.registry.getProvidersByChain(params.chain);
    if (providers.length === 0) {
      throw new Error(`No providers available for chain ${params.chain}`);
    }

    // Try each provider until we get a result
    let lastError: Error | undefined;

    for (const provider of providers) {
      try {
        const tokenInfo = await provider.getTokenInfo(params);
        return tokenInfo;
      } catch (error) {
        console.warn(`Failed to get token info from ${provider.getName()}:`, error);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(
      `No provider could find information for token ${params.query} on chain ${params.chain}. Last error: ${lastError?.message}`,
    );
  }

  createTool(): DynamicStructuredTool<z.ZodObject<any>> {
    console.log('✓ Creating tool', this.getName());
    return new DynamicStructuredTool({
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const {
            query,
            chain = this.defaultChain,
            provider: preferredProvider,
            includePrice = true,
          } = args;

          console.log('🤖 Token Tool Args:', args);

          // Validate chain is supported
          const supportedChains = this.getSupportedChains();
          if (!supportedChains.includes(chain)) {
            throw new Error(
              `Chain ${chain} is not supported. Supported chains: ${supportedChains.join(', ')}`,
            );
          }

          let tokenInfo: TokenInfo;

          if (preferredProvider) {
            const provider = this.registry.getProvider(preferredProvider);
            // Validate provider supports the chain
            if (!provider.getSupportedChains().includes(chain)) {
              throw new Error(`Provider ${preferredProvider} does not support chain ${chain}`);
            }
            tokenInfo = await provider.getTokenInfo({ query, chain, includePrice });
          } else {
            tokenInfo = await this.queryToken({
              query,
              chain,
              includePrice,
            });
          }

          console.log('🤖 Token info:', tokenInfo);

          // Return result as JSON string
          return JSON.stringify({
            status: 'success',
            data: tokenInfo,
            provider: preferredProvider || 'auto',
            chain,
          });
        } catch (error) {
          console.error('Token info error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            chain: args.chain || this.defaultChain,
          });
        }
      },
    });
  }
}
