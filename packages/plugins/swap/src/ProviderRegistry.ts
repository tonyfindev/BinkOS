import { ISwapProvider } from './types';
import { NetworkName } from '@binkai/core';

export class ProviderRegistry {
  private providers: Map<string, ISwapProvider> = new Map();

  registerProvider(provider: ISwapProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): ISwapProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviders(): ISwapProvider[] {
    return Array.from(this.providers.values());
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvidersByNetwork(network: NetworkName | '*'): ISwapProvider[] {
    if (network === '*') {
      return this.getProviders();
    }
    return this.getProviders().filter(provider =>
      provider.getSupportedNetworks().includes(network),
    );
  }
}
