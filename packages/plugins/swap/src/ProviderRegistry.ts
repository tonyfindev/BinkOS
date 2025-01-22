import { ISwapProvider } from './types';

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

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }

  getProvidersByChain(chain: string): ISwapProvider[] {
    return Array.from(this.providers.values()).filter(provider => 
      provider.getSupportedChains().includes(chain)
    );
  }
} 