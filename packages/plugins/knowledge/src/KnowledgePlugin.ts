import { BasePlugin, IPluginConfig } from '@binkai/core';
import { KnowledgeTool } from './KnowledgeTool';
import { IKnowledgeProvider } from './types';

export interface KnowledgePluginConfig extends IPluginConfig {
  providers?: IKnowledgeProvider[];
}

export class KnowledgePlugin extends BasePlugin {
  private knowledgeTool!: KnowledgeTool;
  private providers: Map<string, IKnowledgeProvider> = new Map();

  getName(): string {
    return 'knowledge';
  }

  async initialize(config: KnowledgePluginConfig): Promise<void> {
    // Initialize knowledge tool
    this.knowledgeTool = new KnowledgeTool({});

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools() {
    return [this.knowledgeTool];
  }

  registerProvider(provider: IKnowledgeProvider): void {
    this.providers.set(provider.getName(), provider);
    this.knowledgeTool.registerProvider(provider);
  }

  getProvider(name: string): IKnowledgeProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviders(): IKnowledgeProvider[] {
    return Array.from(this.providers.values());
  }
}
