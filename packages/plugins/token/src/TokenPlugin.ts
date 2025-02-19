import { BasePlugin, IPluginConfig, BaseTool } from '@binkai/core';
import { GetTokenInfoTool } from './TokenTool';
import { ITokenProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';

export interface TokenPluginConfig extends IPluginConfig {
  defaultChain?: string;
  providers?: ITokenProvider[];
  supportedChains?: string[];
}

export class TokenPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private tokenTool!: GetTokenInfoTool;
  private supportedChains: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedChains = new Set();
  }

  getName(): string {
    return 'token';
  }

  async initialize(config: TokenPluginConfig): Promise<void> {
    // Initialize supported chains
    if (config.supportedChains) {
      config.supportedChains.forEach(chain => this.supportedChains.add(chain));
    }

    // Configure token tool
    this.tokenTool = new GetTokenInfoTool({
      defaultChain: config.defaultChain,
      supportedChains: Array.from(this.supportedChains),
    });

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools(): BaseTool[] {
    return [this.tokenTool as unknown as BaseTool];
  }

  /**
   * Register a new token provider
   */
  registerProvider(provider: ITokenProvider): void {
    this.registry.registerProvider(provider);
    this.tokenTool.registerProvider(provider);

    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): ITokenProvider[] {
    return this.registry.getProvidersByChain('*');
  }

  /**
   * Get providers for a specific chain
   */
  getProvidersForChain(chain: string): ITokenProvider[] {
    return this.registry.getProvidersByChain(chain);
  }

  /**
   * Get all supported chains
   */
  getSupportedChains(): string[] {
    return Array.from(this.supportedChains);
  }

  async cleanup(): Promise<void> {
    // Cleanup any provider resources if needed
    const providers = this.getProviders();
    await Promise.all(
      providers.map(async provider => {
        if ('cleanup' in provider && typeof provider.cleanup === 'function') {
          await provider.cleanup();
        }
      }),
    );
  }
}
