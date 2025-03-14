import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import {
  AgentNodeTypes,
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  NetworkName,
  ToolProgress,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { ITokenProvider, TokenInfo, TokenQueryParams } from './types';
import { DefaultTokenProvider } from './providers/DefaultTokenProvider';
import { defaultTokens } from './data/defaultTokens';
import { roundNumber } from './utils/formatting';

export interface GetTokenInfoToolConfig extends IToolConfig {
  supportedNetworks?: NetworkName[];
}

export class GetTokenInfoTool extends BaseTool {
  public readonly agentNodeSupports: AgentNodeTypes[] = [
    AgentNodeTypes.PLANNER,
    AgentNodeTypes.EXECUTOR,
  ];
  public registry: ProviderRegistry;
  private supportedNetworks: Set<NetworkName>;
  private defaultTokenProvider: DefaultTokenProvider;
  // Cache for token information to avoid modifying default tokens
  private tokenCache: Partial<Record<NetworkName, Record<string, TokenInfo>>> = {};

  constructor(config: GetTokenInfoToolConfig) {
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
    console.log('✓ Provider registered', provider.constructor.name);
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
    return 'get_token_info';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Query token information using various providers (${providers}). Supports networks: ${networks}. You can query by token address or symbol.`;
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
      query: z.string().describe('The token address or symbol to query'),
      network: z
        .enum(supportedNetworks as [NetworkName, ...NetworkName[]])
        .describe('The blockchain network to query the token on'),
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

  // Helper to normalize address based on network
  private normalizeAddress(address: string, network: NetworkName): string {
    // For Solana networks, keep the original case
    if (network === NetworkName.SOLANA || network === NetworkName.SOLANA_DEVNET) {
      return address;
    }

    // For EVM networks, lowercase the address
    return address.toLowerCase();
  }

  // Get cache key for token
  private getCacheKey(address: string, network: NetworkName): string {
    return this.normalizeAddress(address, network);
  }

  // Update the token cache
  private updateTokenCache(network: NetworkName, token: TokenInfo): void {
    const cacheKey = this.getCacheKey(token.address, network);

    if (!this.tokenCache[network]) {
      this.tokenCache[network] = {};
    }

    // Store the token with current timestamp and network
    this.tokenCache[network][cacheKey] = {
      ...token,
      network,
      priceUpdatedAt: token.priceUpdatedAt || Date.now(),
    };
  }

  // Get token from cache
  private getTokenFromCache(network: NetworkName, address: string): TokenInfo | null {
    const cacheKey = this.getCacheKey(address, network);

    if (!this.tokenCache[network] || !this.tokenCache[network][cacheKey]) {
      return null;
    }

    return this.tokenCache[network][cacheKey];
  }

  private async fetchTokenPrice(tokenInfo: TokenInfo, network: NetworkName): Promise<TokenInfo> {
    // Check if we have fresh token data in the cache
    const cachedToken = this.getTokenFromCache(network, tokenInfo.address);
    if (cachedToken?.price?.usd && !this.isPriceStale(cachedToken.priceUpdatedAt)) {
      // Use cached token data
      return cachedToken;
    }

    const providers = this.registry.getProvidersByNetwork(network);
    if (providers.length <= 1) {
      // Only default provider available or no providers
      return { ...tokenInfo, network };
    }

    // Try each external provider to get price information
    for (const provider of providers) {
      // Skip the default provider as we already have the token info
      if (provider.getName() === this.defaultTokenProvider.getName()) {
        continue;
      }

      try {
        // Query the provider using the token address
        const updatedTokenInfo = await provider.getTokenInfo({
          query: tokenInfo.address,
          network,
          includePrice: true,
        });

        // If we got price information, update our cache
        if (updatedTokenInfo.price?.usd) {
          // Round the price for display
          const roundedPrice = roundNumber(updatedTokenInfo.price.usd, 6);
          console.log(
            `✓ Updated price for ${tokenInfo.symbol} from ${provider.getName()}: $${roundedPrice}`,
          );

          // Create a merged token with base info from original and price from updated
          const mergedToken: TokenInfo = {
            ...tokenInfo,
            network,
            price: {
              ...updatedTokenInfo.price,
              usd: roundedPrice,
            },
            priceUpdatedAt: Date.now(),
            priceChange24h: roundNumber(updatedTokenInfo.priceChange24h, 2),
            volume24h: roundNumber(updatedTokenInfo.volume24h, 0),
            marketCap: roundNumber(updatedTokenInfo.marketCap, 0),
          };

          // Update the token cache
          this.updateTokenCache(network, mergedToken);

          return mergedToken;
        }
      } catch (error) {
        console.warn(`Failed to get price from ${provider.getName()}:`, error);
        continue;
      }
    }

    // If we couldn't get price from any provider, return the original token with network
    return { ...tokenInfo, network };
  }

  // Check if the price data is stale (older than 1 hour)
  private isPriceStale(timestamp?: number): boolean {
    if (!timestamp) return true;

    const oneHourAgo = Date.now() - 60 * 60 * 1000; // 1 hour in milliseconds
    return timestamp < oneHourAgo;
  }

  private async queryToken(params: TokenQueryParams): Promise<TokenInfo> {
    // Validate network is supported
    const providers = this.registry.getProvidersByNetwork(params.network);
    if (providers.length === 0) {
      throw new Error(`No providers available for network ${params.network}`);
    }

    // Try default provider first
    try {
      let tokenInfo = await this.defaultTokenProvider.getTokenInfo({
        ...params,
        includePrice: false, // Don't require price from default provider
      });

      console.log('✓ Token found in default list:', params.query);

      // Check if we have this token in our cache
      const cachedToken = this.getTokenFromCache(params.network, tokenInfo.address);
      if (cachedToken) {
        // If we have a cached token and price is not requested or not stale, use it
        if (
          !params.includePrice ||
          (cachedToken.price?.usd && !this.isPriceStale(cachedToken.priceUpdatedAt))
        ) {
          return cachedToken;
        }
      }

      // If price is requested, try to fetch it from other providers
      if (params.includePrice) {
        tokenInfo = await this.fetchTokenPrice(tokenInfo, params.network);
      }

      return tokenInfo;
    } catch (error) {
      console.log('Token not found in default list, trying external providers...');
    }

    // If default provider fails, try each external provider until we get a result
    let lastError: Error | undefined;

    for (const provider of providers) {
      // Skip the default provider as we already tried it
      if (provider.getName() === this.defaultTokenProvider.getName()) {
        continue;
      }

      try {
        const tokenInfo = await provider.getTokenInfo(params);

        // Store the complete token in our cache
        this.updateTokenCache(params.network, tokenInfo);

        return tokenInfo;
      } catch (error) {
        console.warn(`Failed to get token info from ${provider.getName()}:`, error);
        lastError = error as Error;
        continue;
      }
    }

    throw new Error(
      `No provider could find information for token ${params.query} on network ${params.network}. Last error: ${lastError?.message}`,
    );
  }

  // Method to manually refresh price for a token
  async refreshTokenPrice(network: NetworkName, address: string): Promise<TokenInfo> {
    // First check if we have this token in our cache
    const cachedToken = this.getTokenFromCache(network, address);

    // If we have a cached token, use it as the base
    if (cachedToken) {
      // Force refresh price from external providers
      const updatedToken = await this.fetchTokenPrice(cachedToken, network);

      // Ensure all numeric values are properly rounded
      if (updatedToken.price?.usd) {
        updatedToken.price.usd = roundNumber(updatedToken.price.usd, 6);
      }
      updatedToken.priceChange24h = roundNumber(updatedToken.priceChange24h, 2);
      updatedToken.volume24h = roundNumber(updatedToken.volume24h, 0);
      updatedToken.marketCap = roundNumber(updatedToken.marketCap, 0);

      return updatedToken;
    }

    // If not in cache, get the token from default provider
    try {
      const tokenInfo = await this.defaultTokenProvider.getTokenInfo({
        query: address,
        network,
        includePrice: false,
      });

      // Force refresh price from external providers
      const updatedToken = await this.fetchTokenPrice(tokenInfo, network);

      // Ensure all numeric values are properly rounded
      if (updatedToken.price?.usd) {
        updatedToken.price.usd = roundNumber(updatedToken.price.usd, 6);
      }
      updatedToken.priceChange24h = roundNumber(updatedToken.priceChange24h, 2);
      updatedToken.volume24h = roundNumber(updatedToken.volume24h, 0);
      updatedToken.marketCap = roundNumber(updatedToken.marketCap, 0);

      return updatedToken;
    } catch (error) {
      throw new Error(
        `Failed to refresh price: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
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
          const { query, network, provider: preferredProvider, includePrice = true } = args;

          console.log('🤖 Token Tool Args:', args);

          onProgress?.({
            progress: 20,
            message: `Searching for token information for "${query}" on ${network} network.`,
          });

          // Validate network is supported
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            throw new Error(
              `Network ${network} is not supported. Supported networks: ${supportedNetworks.join(', ')}`,
            );
          }

          let tokenInfo: TokenInfo;

          if (preferredProvider) {
            onProgress?.({
              progress: 50,
              message: `Querying token information from ${preferredProvider} provider.`,
            });

            const provider = this.registry.getProvider(preferredProvider);
            // Validate provider supports the network
            if (!provider.getSupportedNetworks().includes(network)) {
              throw new Error(`Provider ${preferredProvider} does not support network ${network}`);
            }
            tokenInfo = await provider.getTokenInfo({ query, network, includePrice });

            // If using default provider and price is requested, fetch price from other providers
            if (preferredProvider === this.defaultTokenProvider.getName() && includePrice) {
              tokenInfo = await this.fetchTokenPrice(tokenInfo, network);
            } else {
              // For non-default providers, update our cache
              this.updateTokenCache(network, tokenInfo);
            }
          } else {
            onProgress?.({
              progress: 50,
              message: `Searching for token information across all available providers.`,
            });

            tokenInfo = await this.queryToken({
              query,
              network,
              includePrice,
            });
          }

          // Ensure all numeric values are properly rounded before returning
          if (tokenInfo.price?.usd) {
            tokenInfo.price.usd = roundNumber(tokenInfo.price.usd, 6);
          }
          tokenInfo.priceChange24h = roundNumber(tokenInfo.priceChange24h, 2);
          tokenInfo.volume24h = roundNumber(tokenInfo.volume24h, 0);
          tokenInfo.marketCap = roundNumber(tokenInfo.marketCap, 0);

          console.log('🤖 Token info:', tokenInfo);

          onProgress?.({
            progress: 100,
            message: `Successfully retrieved information for ${tokenInfo.name || tokenInfo.symbol || query}${tokenInfo.price?.usd ? ` (Current price: $${tokenInfo.price.usd})` : ''}.`,
          });

          // Return result as JSON string
          return JSON.stringify({
            status: 'success',
            data: tokenInfo,
            provider: preferredProvider || 'auto',
            network,
          });
        } catch (error) {
          console.error('Token info error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
            network: args.network,
          });
        }
      },
    };
  }
}
