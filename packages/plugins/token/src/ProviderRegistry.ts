import { ITokenProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, ITokenProvider> = new Map();

  registerProvider(provider: ITokenProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): ITokenProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvidersByChain(chain: string): ITokenProvider[] {
    return Array.from(this.providers.values()).filter(provider =>
      provider.getSupportedChains().includes(chain)
    );
  }

  getAllProviders(): ITokenProvider[] {
    return Array.from(this.providers.values());
  }
} 