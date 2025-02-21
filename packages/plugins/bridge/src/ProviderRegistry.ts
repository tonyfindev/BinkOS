import { BridgeProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, BridgeProvider> = new Map();

  registerProvider(provider: BridgeProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): BridgeProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProviders(): BridgeProvider[] {
    return Array.from(this.providers.values());
  }

  getProvidersByChain(chain: string): BridgeProvider[] {
    return Array.from(this.providers.values()).filter(provider =>
      provider.getSupportedChains().includes(chain),
    );
  }
}
