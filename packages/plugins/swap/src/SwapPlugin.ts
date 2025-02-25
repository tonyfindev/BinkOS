import { SwapTool } from './SwapTool';
import { ISwapProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';
import { BaseTool, IPluginConfig, BasePlugin, NetworkName } from '@binkai/core';

export interface SwapPluginConfig extends IPluginConfig {
  defaultSlippage?: number;
  defaultNetwork?: string;
  providers?: ISwapProvider[];
  supportedNetworks?: string[];
}

export class SwapPlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private swapTool!: SwapTool;
  private supportedNetworks: Set<string>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set();
  }

  getName(): string {
    return 'swap';
  }

  async initialize(config: SwapPluginConfig): Promise<void> {
    // Initialize supported networks
    if (config.supportedNetworks) {
      config.supportedNetworks.forEach(network => this.supportedNetworks.add(network));
    }

    // Configure swap tool
    this.swapTool = new SwapTool({
      defaultSlippage: config.defaultSlippage,
      defaultNetwork: config.defaultNetwork,
      supportedNetworks: Array.from(this.supportedNetworks),
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

    // Add provider's supported networks
    provider.getSupportedNetworks().forEach((network: NetworkName) => {
      this.supportedNetworks.add(network);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): ISwapProvider[] {
    return this.registry.getProvidersByNetwork('*');
  }

  /**
   * Get providers for a specific network
   */
  getProvidersForNetwork(network: NetworkName): ISwapProvider[] {
    return this.registry.getProvidersByNetwork(network);
  }

  /**
   * Get all supported networks
   */
  getSupportedNetworks(): NetworkName[] {
    return Array.from(this.supportedNetworks) as NetworkName[];
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
