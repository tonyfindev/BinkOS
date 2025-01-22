import { SwapTool } from './SwapTool';
import { ISwapProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';
import { BaseTool, IPluginConfig, BasePlugin } from '@binkai/core';

export interface SwapPluginConfig extends IPluginConfig {
  defaultSlippage?: number;
  defaultChain?: string;
  providers?: ISwapProvider[];
  supportedChains?: string[];
}

export class SwapPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private swapTool!: SwapTool;
  private supportedChains: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedChains = new Set();
  }

  getName(): string {
    return 'swap';
  }

  async initialize(config: SwapPluginConfig): Promise<void> {
    // Initialize supported chains
    if (config.supportedChains) {
      config.supportedChains.forEach(chain => this.supportedChains.add(chain));
    }

    // Configure swap tool
    this.swapTool = new SwapTool({
      defaultSlippage: config.defaultSlippage,
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
    return [this.swapTool as unknown as BaseTool];
  }

  /**
   * Register a new swap provider
   */
  registerProvider(provider: ISwapProvider): void {
    this.registry.registerProvider(provider);
    this.swapTool.registerProvider(provider);

    // Add provider's supported chains
    provider.getSupportedChains().forEach(chain => {
      this.supportedChains.add(chain);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): ISwapProvider[] {
    return this.registry.getProvidersByChain('*');
  }

  /**
   * Get providers for a specific chain
   */
  getProvidersForChain(chain: string): ISwapProvider[] {
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
      providers.map(async (provider) => {
        if ('cleanup' in provider && typeof provider.cleanup === 'function') {
          await provider.cleanup();
        }
      })
    );
  }
} 