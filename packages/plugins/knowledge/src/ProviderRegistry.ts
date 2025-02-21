import { IKnowledgeProvider } from './types';

export class ProviderRegistry {
  private providers: Map<string, IKnowledgeProvider> = new Map();

  registerProvider(provider: IKnowledgeProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  getProvider(name: string): IKnowledgeProvider {
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
