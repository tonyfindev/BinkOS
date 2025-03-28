import { BasePlugin, IPluginConfig } from '@binkai/core';
import { CreateImageTool } from './CreateImageTool';
import { IImageProvider } from './types';

export interface ImagePluginConfig extends IPluginConfig {
  providers?: IImageProvider[];
}

export class ImagePlugin extends BasePlugin {
  private createImageTool!: CreateImageTool;
  private providers: Map<string, IImageProvider> = new Map();

  getName(): string {
    return 'image';
  }

  async initialize(config: ImagePluginConfig): Promise<void> {
    // Initialize image tool
    this.createImageTool = new CreateImageTool({});

    // Register providers if provided in config
    if (config.providers) {
      for (const provider of config.providers) {
        this.registerProvider(provider);
      }
    }
  }

  getTools() {
    return [this.createImageTool];
  }

  registerProvider(provider: IImageProvider): void {
    this.providers.set(provider.getName(), provider);
    this.createImageTool.registerProvider(provider);
  }

  getProvider(name: string): IImageProvider {
    const provider = this.providers.get(name);
    if (!provider) {
      throw new Error(`Provider ${name} not found`);
    }
    return provider;
  }

  getProviders(): IImageProvider[] {
    return Array.from(this.providers.values());
  }
}
