import { BaseTool, CustomDynamicStructuredTool, IToolConfig } from '@binkai/core';
import { z } from 'zod';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { IKnowledgeProvider } from './types';

export class KnowledgeTool extends BaseTool {
  private providers: Map<string, IKnowledgeProvider> = new Map();

  constructor(config: IToolConfig) {
    super(config);
  }

  getName(): string {
    return 'knowledge';
  }

  getDescription(): string {
    const providers = Array.from(this.providers.keys()).join(', ');
    return `Query knowledge base using various providers (${providers}). Use this when other tools cannot answer the question.`;
  }

  registerProvider(provider: IKnowledgeProvider): void {
    this.providers.set(provider.getName(), provider);
  }

  mockResponseTool(args: any): Promise<string> {
    return Promise.resolve(
      JSON.stringify({
        status: args.status,
      }),
    );
  }
  getSchema(): z.ZodObject<any> {
    const providers = Array.from(this.providers.keys());
    if (providers.length === 0) {
      throw new Error('No knowledge providers registered');
    }

    return z.object({
      question: z.string().describe('The question to ask'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The provider to use for question. If not specified, the default provider will be used',
        ),
      context: z.string().optional().describe('Additional context to help answer the question'),
    });
  }

  createTool(): CustomDynamicStructuredTool {
    return {
      name: this.getName(),
      description: this.getDescription(),
      schema: this.getSchema(),
      func: async (args: any) => {
        try {
          const { question, provider: providerName, context } = args;

          let provider: IKnowledgeProvider;
          if (providerName) {
            const selectedProvider = this.providers.get(providerName);
            if (!selectedProvider) {
              throw new Error(`Provider ${providerName} not found`);
            }
            provider = selectedProvider;
          } else {
            // Get first provider or throw error if none exists
            const firstProvider = this.providers.values().next().value;
            if (!firstProvider) {
              throw new Error('No provider available');
            }
            provider = firstProvider;
          }

          const response = await provider.query({ question, context });

          return JSON.stringify({
            status: 'success',
            provider: provider.getName(),
            sources: response.sources,
          });
        } catch (error) {
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    };
  }
}
