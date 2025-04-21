import { z } from 'zod';
import {
  AgentNodeTypes,
  BaseTool,
  CustomDynamicStructuredTool,
  IToolConfig,
  ToolProgress,
  NetworkName,
} from '@binkai/core';
import { BaseClaimProvider } from './BaseClaimProvider';
import { ClaimableBalances, ClaimParams, ClaimQuote } from './types';

export interface ClaimToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export class ClaimTool extends BaseTool {
  private providers: BaseClaimProvider[];
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: ClaimToolConfig, providers: BaseClaimProvider[]) {
    super(config);
    this.providers = providers;
    this.defaultNetwork = config.defaultNetwork || 'bnb';
    this.supportedNetworks = new Set<string>(config.supportedNetworks || []);

    // Add provider's supported networks
    providers.forEach(provider => {
      provider.getSupportedNetworks().forEach(network => {
        this.supportedNetworks.add(network);
      });
    });
  }

  getName(): string {
    return 'claim';
  }

  getDescription(): string {
    const providers = this.providers.map(p => p.getName()).join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    let description = `Claim tokens from various protocols (${providers}). Supports networks: ${networks}.
    
Before using this tool, you should first check your claimable balances using the get_claimable_balance tool to see what tokens you can claim. This tool will handle the claiming process for tokens that have completed their lock or vesting period.`;

    // Add provider-specific prompts if they exist
    const providerPrompts = this.providers
      .map((provider: BaseClaimProvider) => {
        const prompt = provider.getPrompt?.();
        return prompt ? `${provider.getName()}: ${prompt}` : null;
      })
      .filter((prompt: unknown): prompt is string => !!prompt);

    if (providerPrompts.length > 0) {
      description += '\n\nProvider-specific information:\n' + providerPrompts.join('\n');
    }

    return description;
  }

  private getSupportedNetworks(): string[] {
    // Get networks from agent's wallet
    const agentNetworks = Object.keys(this.agent.getNetworks());

    // Intersect with supported networks from providers
    const providerNetworks = Array.from(this.supportedNetworks);

    // Return intersection of agent networks and provider supported networks
    return agentNetworks.filter(network => providerNetworks.includes(network));
  }

  getSchema(): z.ZodObject<any> {
    const providers = this.providers.map(p => p.getName());
    if (providers.length === 0) {
      throw new Error('No claim providers registered');
    }

    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      uuid: z.string().describe('The unique identifier of the claimable balance'),
      network: z
        .enum(supportedNetworks as [string, ...string[]])
        .describe('The blockchain network to execute the claim on'),
      provider: z
        .enum(providers as [string, ...string[]])
        .optional()
        .describe(
          'The provider to use for claiming. If not specified, the appropriate provider will be determined',
        ),
    });
  }

  /**
   * Get a provider by name
   */
  getProvider(name: string): BaseClaimProvider | undefined {
    return this.providers.find(provider => provider.getName().toLowerCase() === name.toLowerCase());
  }

  createTool(): CustomDynamicStructuredTool {
    console.log('✓ Creating tool', this.getName());
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
          const { uuid, network = this.defaultNetwork, provider: preferredProvider } = args;

          console.log('🤖 Claim Args:', args);

          if (this.agent.isMockResponseTool()) {
            return this.mockResponseTool(args);
          }

          // Get agent's wallet and address
          const wallet = this.agent.getWallet();
          const userAddress = await wallet.getAddress(network);

          // Validate network is supported
          const supportedNetworks = this.getSupportedNetworks();
          if (!supportedNetworks.includes(network)) {
            throw new Error(
              `Network ${network} is not supported. Supported networks: ${supportedNetworks.join(', ')}`,
            );
          }

          // Find the appropriate provider
          let selectedProvider;
          if (preferredProvider) {
            selectedProvider = this.getProvider(preferredProvider);
            if (!selectedProvider) {
              throw new Error(`Provider ${preferredProvider} not found`);
            }

            // Validate provider supports the network
            if (!selectedProvider.getSupportedNetworks().includes(network as NetworkName)) {
              throw new Error(`Provider ${preferredProvider} does not support network ${network}`);
            }
          } else {
            throw new Error('No provider specified');
          }

          onProgress?.({
            progress: 30,
            message: `Getting claim quote from ${selectedProvider.getName()}.`,
          });

          // Get quote directly from the provider
          const claimParams: ClaimParams = {
            network: network as NetworkName,
            uuid,
          };
          const quote = await selectedProvider.getQuote(claimParams, userAddress);

          console.log('🤖 The selected provider is:', selectedProvider.getName());

          onProgress?.({
            progress: 50,
            message: `Preparing to claim your tokens via ${selectedProvider.getName()}.`,
          });

          // Build claim transaction
          const claimTx = quote.tx;

          onProgress?.({
            progress: 80,
            message: `Executing claim operation.`,
          });

          // Sign and send claim transaction
          const receipt = await wallet.signAndSendTransaction(network, {
            to: claimTx.to,
            data: claimTx.data,
            value: BigInt(claimTx.value),
          });

          // Wait for transaction to be mined
          const finalReceipt = await receipt.wait();

          // Return result as JSON string
          return JSON.stringify({
            status: 'success',
            provider: selectedProvider.getName(),
            uuid: uuid,
            transactionHash: finalReceipt.hash,
            network,
          });
        } catch (error) {
          console.error('Claim error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    };
  }

  mockResponseTool(args: any): Promise<string> {
    return Promise.resolve(
      JSON.stringify({
        provider: args.provider,
        uuid: args.uuid,
        network: args.network,
        transactionHash:
          '0x' +
          Array(64)
            .fill(0)
            .map(() => Math.floor(Math.random() * 16).toString(16))
            .join(''),
      }),
    );
  }
}
