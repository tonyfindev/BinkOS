import { BasePlugin, IPluginConfig } from '@binkai/core';
import { RetrievalTool } from './RetrievalTool';
import { IRetrievalProvider } from './types';

export interface RetrievalPluginConfig extends IPluginConfig {
  providers?: IRetrievalProvider[];
}

export class RetrievalPlugin extends BasePlugin {
  private retrievalTool!: RetrievalTool;
  private providers: Map<string, IRetrievalProvider> = new Map();

  getName(): string {
    return 'retrieval';
  }

  async initialize(config: RetrievalPluginConfig): Promise<void> {
    // Initialize retrieval tool
    this.retrievalTool = new RetrievalTool({});

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools() {
    return [this.retrievalTool];
  }

  registerProvider(provider: IRetrievalProvider): void {
    this.providers.set(provider.getName(), provider);
    this.retrievalTool.registerProvider(provider);
  }

  getProvider(name: string): IRetrievalProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviders(): IRetrievalProvider[] {
    return Array.from(this.providers.values());
  }
} 