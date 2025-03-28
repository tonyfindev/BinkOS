import { z } from 'zod';
import {
  BaseTool,
  CustomDynamicStructuredTool,
  ErrorStep,
  IToolConfig,
  settings,
  NetworkName,
  ToolProgress,
} from '@binkai/core';
import { ProviderRegistry } from './ProviderRegistry';
import { IImageProvider } from './types';
import axios from 'axios';

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

    // Get API URL from environment or use default
    const API_BASE_URL = settings.get('IMAGE_API_URL') || '';

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
          const { prompt, image_url } = args;
          console.log('🤖 Create image Args:', args);

          // Generate a unique request ID
          const requestId = `req-${Math.random().toString(36).substring(2, 15)}`;

          onProgress?.({
            progress: 30,
            message: 'Sending image generation request',
          });

          // Send image generation request using environment variable
          try {
            await axios.post(`${API_BASE_URL}/image/generate`, {
              prompt,
              url: image_url || '',
              requestId,
            });
          } catch (error: any) {
            throw this.createError(
              ErrorStep.API_REQUEST,
              `Failed to generate image: ${error.message}`,
              { error: error.message },
            );
          }

          // Poll for image status using environment variable
          let imageData = null;
          let attempts = 0;
          const maxAttempts = 150;
          const pollingInterval = 2000;

          while (attempts < maxAttempts) {
            try {
              const response = await axios.get(`${API_BASE_URL}/image/status/${requestId}`);
              const status = response.data;

              if (status.data.status === 'success') {
                imageData = status.data.data;
                break;
              } else if (status.data.status === 'error') {
                throw this.createError(
                  ErrorStep.API_RESPONSE,
                  `Image generation failed: ${status.data.message || 'Unknown error'}`,
                  { error: status.data.message },
                );
              }

              const progressPercentage = 50 + Math.min(40, attempts * (40 / maxAttempts));
              onProgress?.({
                progress: progressPercentage,
                message: `Processing image generation... (${Math.round(progressPercentage)}%)`,
              });

              await new Promise(resolve => setTimeout(resolve, pollingInterval));
              attempts++;
            } catch (error: any) {
              throw this.createError(
                ErrorStep.API_RESPONSE,
                `Failed to check image status: ${error.message}`,
                { error: error.message },
              );
            }
          }

          if (!imageData) {
            throw this.createError(
              ErrorStep.API_RESPONSE,
              'Image generation timed out after 5 minutes',
              { error: 'Timeout' },
            );
          }

          onProgress?.({
            progress: 100,
            message: 'Image generated successfully',
          });

          // Return result as JSON string
          return JSON.stringify({
            status: 'success',
            fileName: imageData?.fileName,
            imageUrl: imageData?.downloadUrl,
            prompt,
          });
        } catch (error: any) {
          // Use BaseTool's error handling
          return this.handleError(error, args);
        }
      },
    };
  }
}
