import { z } from 'zod';
import { BaseTool, CustomDynamicStructuredTool, IToolConfig, ToolProgress } from '@binkai/core';
import { BaseClaimProvider } from './BaseClaimProvider';
import { ClaimableBalances } from './types';

export interface GetClaimableBalanceToolConfig extends IToolConfig {
  defaultNetwork?: string;
  supportedNetworks?: string[];
}

export class GetClaimableBalanceTool extends BaseTool {
  private providers: BaseClaimProvider[];
  private defaultNetwork: string;
  private supportedNetworks: Set<string>;

  constructor(config: GetClaimableBalanceToolConfig, providers: BaseClaimProvider[]) {
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
    return 'get_claimable_balance';
  }

  getDescription(): string {
    const providers = this.providers.map(p => p.getName()).join(', ');
    const networks = Array.from(this.supportedNetworks).join(', ');
    return `Get all claimable token balances from various protocols (${providers}). Supports networks: ${networks}. This tool will show you tokens that are ready to be claimed after their lock or vesting period has completed.`;
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
    const supportedNetworks = this.getSupportedNetworks();
    if (supportedNetworks.length === 0) {
      throw new Error('No supported networks available');
    }

    return z.object({
      network: z
        .enum(supportedNetworks as [string, ...string[]])
        .optional()
        .describe(
          'The blockchain network to check for claimable balances. If not specified, all supported networks will be checked.',
        ),
      provider: z
        .string()
        .optional()
        .describe(
          'The provider to check for claimable balances. If not specified, all providers will be checked.',
        ),
    });
  }

  /**
   * Get all claimable balances across all providers
   */
  async getAllClaimableBalances(
    walletAddress: string,
    network?: string,
    providerName?: string,
  ): Promise<ClaimableBalances[]> {
    let providersToCheck = this.providers;

    // Filter by provider name if specified
    if (providerName) {
      const provider = this.providers.find(
        p => p.getName().toLowerCase() === providerName.toLowerCase(),
      );
      if (!provider) {
        throw new Error(`Provider ${providerName} not found`);
      }
      providersToCheck = [provider];
    }

    // Filter by network if specified
    if (network) {
      providersToCheck = providersToCheck.filter(p =>
        p.getSupportedNetworks().some(n => n.toLowerCase() === network.toLowerCase()),
      );
    }

    const balancesPromises = providersToCheck.map(async provider => {
      try {
        return await provider.getAllClaimableBalances(walletAddress);
      } catch (error) {
        console.error(`Error getting claimable balances from ${provider.getName()}:`, error);
        return {
          address: walletAddress,
          tokens: [],
        };
      }
    });
    return Promise.all(balancesPromises);
  }

  mockResponseTool(): Promise<string> {
    // Create a mock response with sample claimable balances
    const mockBalances = [
      {
        provider: 'lista',
        address: '0x1234567890123456789012345678901234567890',
        tokens: [
          {
            uuid: '123456789',
            claimableAmount: '1.5',
            estimatedTime: new Date(Date.now() + 86400000).toISOString(), // 1 day from now
          },
        ],
      },
    ];

    return Promise.resolve(JSON.stringify(mockBalances));
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
          const { network, provider } = args;

          console.log('🤖 Get Claimable Balance Args:', args);

          if (this.agent.isMockResponseTool()) {
            return this.mockResponseTool();
          }

          // Get agent's wallet and address
          const wallet = this.agent.getWallet();
          const userAddress = await wallet.getAddress(network || this.defaultNetwork);

          onProgress?.({
            progress: 30,
            message: `Checking for claimable balances...`,
          });

          // Get all claimable balances
          const balances = await this.getAllClaimableBalances(userAddress, network, provider);

          // Format the response
          const formattedBalances = balances.map(balance => {
            // Find the provider name for this balance
            const providerName =
              this.providers
                .find(p =>
                  p
                    .getAllClaimableBalances(userAddress)
                    .then(b => b.address === balance.address)
                    .catch(() => false),
                )
                ?.getName() || 'unknown';

            return {
              provider: providerName,
              address: balance.address,
              tokens: balance.tokens.map(token => ({
                uuid: token.uuid?.toString(),
                claimableAmount: token.claimableAmount,
                estimatedTime:
                  token.estimatedTime instanceof Date
                    ? token.estimatedTime.toISOString()
                    : token.estimatedTime,
              })),
            };
          });

          onProgress?.({
            progress: 100,
            message: `Found ${formattedBalances.reduce((sum, b) => sum + b.tokens.length, 0)} claimable balances.`,
          });

          // Return result as JSON string
          return JSON.stringify(formattedBalances);
        } catch (error) {
          console.error('Get claimable balance error:', error);
          return JSON.stringify({
            status: 'error',
            message: error instanceof Error ? error.message : String(error),
          });
        }
      },
    };
  }
}
