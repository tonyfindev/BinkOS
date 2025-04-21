import { ClaimTool } from './ClaimTool';
import { GetClaimableBalanceTool } from './GetClaimableBalanceTool';
import { BaseClaimProvider } from './BaseClaimProvider';
import { BaseTool, IPluginConfig, BasePlugin, NetworkName } from '@binkai/core';

export interface ClaimPluginConfig extends IPluginConfig {
  defaultNetwork?: string;
  providers?: BaseClaimProvider[];
  supportedNetworks?: string[];
}

export class ClaimPlugin extends BasePlugin {
  private providers: BaseClaimProvider[] = [];
  private claimTool!: ClaimTool;
  private getClaimableBalanceTool!: GetClaimableBalanceTool;
  private supportedNetworks: Set<string>;
  private pluginConfig: ClaimPluginConfig = {};

  constructor() {
    super();
    this.supportedNetworks = new Set();
  }

  getName(): string {
    return 'claim';
  }

  async initialize(config: ClaimPluginConfig): Promise<void> {
    this.pluginConfig = config;
    // Initialize supported networks
    if (config.supportedNetworks) {
      config.supportedNetworks.forEach(network => this.supportedNetworks.add(network));
    }

    // Configure claim tools
    this.claimTool = new ClaimTool(
      {
        defaultNetwork: config.defaultNetwork,
        supportedNetworks: Array.from(this.supportedNetworks),
      },
      this.providers,
    );

    this.getClaimableBalanceTool = new GetClaimableBalanceTool(
      {
        defaultNetwork: config.defaultNetwork,
        supportedNetworks: Array.from(this.supportedNetworks),
      },
      this.providers,
    );

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools(): BaseTool[] {
    return [this.claimTool, this.getClaimableBalanceTool];
  }

  /**
   * Register a new Claim provider
   */
  registerProvider(provider: BaseClaimProvider): void {
    this.providers.push(provider);

    // Update the providers in the tools
    this.claimTool = new ClaimTool(
      {
        defaultNetwork: this.pluginConfig.defaultNetwork || 'bnb',
        supportedNetworks: Array.from(this.supportedNetworks),
      },
      this.providers,
    );

    this.getClaimableBalanceTool = new GetClaimableBalanceTool(
      {
        defaultNetwork: this.pluginConfig.defaultNetwork || 'bnb',
        supportedNetworks: Array.from(this.supportedNetworks),
      },
      this.providers,
    );

    // Add provider's supported networks
    provider.getSupportedNetworks().forEach((network: NetworkName) => {
      this.supportedNetworks.add(network);
    });
  }

  /**
   * Get all registered providers
   */
  getProviders(): BaseClaimProvider[] {
    return this.providers;
  }

  /**
   * Get providers for a specific network
   */
  getProvidersForNetwork(network: NetworkName): BaseClaimProvider[] {
    return this.providers.filter(provider => provider.getSupportedNetworks().includes(network));
  }

  /**
   * Get all supported networks
   */
  getSupportedNetworks(): NetworkName[] {
    return Array.from(this.supportedNetworks) as NetworkName[];
  }

  /**
   * Get the claim tool
   */
  getClaimTool(): ClaimTool {
    return this.claimTool;
  }

  /**
   * Get the get claimable balance tool
   */
  getGetClaimableBalanceTool(): GetClaimableBalanceTool {
    return this.getClaimableBalanceTool;
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
