import { IRetrievalProvider } from "./types";

export class ProviderRegistry {
  private providers: Map<string, IRetrievalProvider> = new Map();

  registerProvider(provider: IRetrievalProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): IRetrievalProvider {
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
