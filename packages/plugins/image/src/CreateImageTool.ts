import { z } from 'zod';
import {
  BaseTool,
  CustomDynamicStructuredTool,
  ErrorStep,
  IToolConfig,
  NetworkName,
  ToolProgress,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IImageProvider } from './types';

export interface CreateImageToolConfig extends IToolConfig {
  supportedNetworks?: NetworkName[];
}

export class CreateImageTool extends BaseTool {
  public registry: ProviderRegistry;
  private supportedNetworks: Set<NetworkName>;

  constructor(config: CreateImageToolConfig) {
    super(config);
    this.registry = new ProviderRegistry();
    this.supportedNetworks = new Set<NetworkName>(config.supportedNetworks || []);
  }

  registerProvider(provider: IImageProvider): void {
    this.registry.registerProvider(provider);
    console.log('✓ Provider registered CreateImageTool', provider.constructor.name);
    // Add provider's supported networks
    provider.getSupportedNetworks().forEach(network => {
      this.supportedNetworks.add(network);
    });
  }

  getName(): string {
    return 'create_image';
  }

  getDescription(): string {
    const providers = this.registry.getProviderNames().join(', ');
    // const networks = Array.from(this.supportedNetworks).join(', ');
    return `Create image from prompt of user or based on image url , description using various providers (${providers}).`;
  }

  private getSupportedNetworks(): NetworkName[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks()) as NetworkName[];

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.registry.getProviderNames();
    if (providers.length === 0) {
      throw new Error('No image providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      prompt: z.string().describe('The prompt of user for generate image'),
      image_url: z
        .string()
        .optional()
        .describe('The image url needs to be used to generate the image.'),
    });
  }

  createTool(): CustomDynamicStructuredTool {
    console.log('🛠️ Creating create image tool');
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (
        args: any,
        runManager?: any,
        config?: any,
        onProgress?: (data: ToolProgress) => void,
      ) => {
        try {
          const { prompt, image_url, provider: preferredProvider } = args;
          console.log('🤖 Create image Args:', args);

          //       // Return result as JSON string
          return JSON.stringify({
            status: 'success',
          });
          //       });
        } catch (error: any) {
          // Use BaseTool's error handling
          return this.handleError(error, args);
        }
      },
    };
  }
}
