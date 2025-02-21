import { BridgeTool } from './BridgeTool';
import { BridgeProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';
import { BaseTool, IPluginConfig, BasePlugin } from '@binkai/core';

export interface BridgePluginConfig extends IPluginConfig {
  defaultChain?: string;
  providers?: BridgeProvider[];
  supportedChains?: string[];
}

export class BridgePlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private bridgeTool!: BridgeTool;
  private supportedChains: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedChains = new Set();
  }

  getName(): string {
    return 'bridge';
  }

  async initialize(config: BridgePluginConfig): Promise<void> {
    // Initialize supported chains
    if (config.supportedChains) {
      config.supportedChains.forEach(chain => this.supportedChains.add(chain));
    }

    // Configure bridge tool
    this.bridgeTool = new BridgeTool({
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
    return [this.bridgeTool];
  }

  /**
   * Register a new bridge provider
   */
  registerProvider(provider: BridgeProvider): void {
    this.registry.registerProvider(provider);
    this.bridgeTool.registerProvider(provider);

    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): BridgeProvider[] {
    return this.registry.getProviders();
  }

  /**
   * Get providers for a specific chain
   */
  getProvidersForChain(chain: string): BridgeProvider[] {
    return this.registry.getProvidersByChain(chain);
  }

  /**
   * Get providers that support both chains
   */
  getProvidersForChainPair(fromChain: string, toChain: string): BridgeProvider[] {
    return this.getProvidersForChain(fromChain).filter(provider =>
      provider.getSupportedChains().includes(toChain),
    );
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
