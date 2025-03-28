import { IImageProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, IImageProvider> = new Map();

  registerProvider(provider: IImageProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): IImageProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviderNames(): string[] {
    return Array.from(this.providers.keys());
  }
}
