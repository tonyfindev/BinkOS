import { BasePlugin, IPluginConfig, BaseTool, NetworkName, IAgent } from '@binkai/core';
import { IImageProvider } from './types';
import { ProviderRegistry } from './ProviderRegistry';
import { CreateImageTool } from './CreateImageTool';

export interface ImagePluginConfig extends IPluginConfig {
  providers?: IImageProvider[];
  supportedNetworks?: NetworkName[];
}

export class ImagePlugin extends BasePlugin {
  public registry: ProviderRegistry;
  private createImageTool!: CreateImageTool;
  private supportedNetworks: Set<NetworkName>;

  constructor() {
    super();
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set();
  }

  getName(): string {
    return 'image';
  }

  async initialize(config: ImagePluginConfig): Promise<void> {
    // Initialize supported networks
    if (config.supportedNetworks) {
      config.supportedNetworks.forEach(network => this.supportedNetworks.add(network));
    }

    // Configure image tool
    this.createImageTool = new CreateImageTool({
      supportedNetworks: Array.from(this.supportedNetworks),
    });

    // Configure create image tool
    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools(): BaseTool[] {
    return [this.createImageTool as unknown as BaseTool];
  }

  /**
   * Register a new image provider
   */
  registerProvider(provider: IImageProvider): void {
    this.registry.registerProvider(provider);
    this.createImageTool.registerProvider(provider);

    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): IImageProvider[] {
    return this.registry.getProvidersByNetwork('*');
  }

  /**
   * Get providers for a specific network
   */
  // getProvidersForNetwork(network: NetworkName): IImageProvider[] {
  //   return this.registry.getProvidersByNetwork(network);
  // }

  /**
   * Get all supported networks
   */
  getSupportedNetworks(): NetworkName[] {
    return Array.from(this.supportedNetworks);
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
