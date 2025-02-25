import { NetworkName } from '@binkai/core';
import { ITokenProvider } from './types';

export class ProviderRegistry {
  private providers: ITokenProvider[] = [];

  registerProvider(provider: ITokenProvider): void {
    this.providers.push(provider);
  }

  getProvider(name: string): ITokenProvider {
    const provider = this.providers.find(p => p.getName() === name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviderNames(): string[] {
    return this.providers.map(provider => provider.getName());
  }

  getProvidersByNetwork(network: NetworkName | '*'): ITokenProvider[] {
    if (network === '*') {
      return this.providers;
    }
    return this.providers.filter(provider => provider.getSupportedNetworks().includes(network));
  }
}
