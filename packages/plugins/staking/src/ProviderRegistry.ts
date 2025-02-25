import { IStakingProvider } from './types';
import { NetworkName } from '@binkai/core';

export class ProviderRegistry {
  private providers: Map<string, IStakingProvider> = new Map();

  registerProvider(provider: IStakingProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): IStakingProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviders(): IStakingProvider[] {
    return Array.from(this.providers.values());
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvidersByNetwork(network: NetworkName | '*'): IStakingProvider[] {
    if (network === '*') {
      return this.getProviders();
    }
    return this.getProviders().filter(provider =>
      provider.getSupportedNetworks().includes(network),
    );
  }
}
