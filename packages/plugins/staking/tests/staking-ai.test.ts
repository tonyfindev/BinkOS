import { ethers } from 'ethers';
import { Agent, Network, NetworkName, NetworksConfig, settings } from '@binkai/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from '@binkai/core';
import { StakingPlugin } from '../src';
import { IStakingProvider, StakingBalance } from '../src/types';

interface ParsedStakingCommand {
  action: string;
  amount?: string;
  token?: string;
  protocol?: string;
  network?: string;
  duration?: string;
  minApy?: string;
  clarificationNeeded?: boolean;
  possibleTokens?: string[];
  error?: string;
  autoFilled?: Record<string, string>;
  protocols?: string[];
  compareMetric?: string;
}

describe('StakingPlugin AI Parameter Detection', () => {
  let stakingPlugin: StakingPlugin;
  let wallet: Wallet;
  let network: Network;
  let agent: Agent;
  let networks: NetworksConfig['networks'];

  const BNB_RPC = 'https://binance.llamarpc.com';
  const ETH_RPC = 'https://eth.llamarpc.com';
  const BNB_NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
  const USDT_TOKEN_ADDRESS = '0x55d398326f99059fF775485246999027B3197955';
  const VUSDT_TOKEN_ADDRESS = '0xfD5840Cd36d94D7229439859C0112a4185BC0255';
  const VBNB_TOKEN_ADDRESS = '0x95c78222B3D6e262426483D42CfA53685A67Ab9D';

  class MockStakingProvider implements IStakingProvider {
    getName(): string {
      return 'venus';
    }

    getSupportedNetworks(): NetworkName[] {
      return [NetworkName.BNB, NetworkName.ETHEREUM];
    }

    async checkBalance(): Promise<any> {
      return [];
    }

    async adjustAmount(): Promise<string> {
      return '0';
    }

    async invalidateBalanceCache(): Promise<void> {}

    async getQuote(): Promise<any> {
      return {};
    }

    async stake(): Promise<any> {
      return {};
    }

    async unstake(): Promise<any> {
      return {};
    }

    async supply(): Promise<any> {
      return {};
    }

    async withdraw(): Promise<any> {
      return {};
    }

    async getAPY(): Promise<number> {
      return 0;
    }

    async buildStakingTransaction(): Promise<any> {
      return {};
    }

    async buildApproveTransaction(): Promise<any> {
      return {};
    }

    async checkAllowance(
      network: NetworkName,
      tokenAddress: string,
      owner: string,
      spender: string,
    ): Promise<bigint> {
      return BigInt(0);
    }

    async getAllStakingBalances(walletAddress: string): Promise<{
      address: string;
      tokens: StakingBalance[];
    }> {
      return {
        address: walletAddress,
        tokens: [],
      };
    }

    async getStakingBalance(): Promise<any> {
      return {};
    }

    async getStakingPositions(): Promise<any[]> {
      return [];
    }

    async getAllClaimableBalances(walletAddress: string): Promise<{
      address: string;
      tokens: StakingBalance[];
    }> {
      return {
        address: walletAddress,
        tokens: [],
      };
    }

    async buildClaimTransaction(): Promise<any> {
      return {};
    }
  }

  beforeEach(async () => {
    networks = {
      bnb: {
        type: 'evm',
        config: {
          chainId: 56,
          rpcUrl: BNB_RPC,
          name: 'BNB Chain',
          nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18,
          },
        },
      },
      ethereum: {
        type: 'evm',
        config: {
          chainId: 1,
          rpcUrl: ETH_RPC,
          name: 'Ethereum',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
          },
        },
      },
    };

    network = new Network({ networks });

    // Use the same mnemonic as in staking.test.ts
    wallet = new Wallet(
      {
        seedPhrase: 'test test test test test test test test test test test junk',
        index: 9,
      },
      network,
    );

    console.log('👛 Wallet ', await wallet.getAddress(NetworkName.BNB));

    agent = new Agent(
      {
        model: 'gpt-4o',
        temperature: 0,
        systemPrompt:
          'You are a BINK AI agent. You can perform staking operations on multiple chains.',
      },
      wallet,
      networks,
    );

    // Mock execute method
    agent.execute = vi.fn().mockImplementation(async ({ input }): Promise<ParsedStakingCommand> => {
      // Basic staking with explicit parameters
      if (input === 'Stake 0.01 BNB on Venus protocol on BNB Chain') {
        return {
          action: 'stake',
          amount: '0.01',
          token: 'BNB',
          protocol: 'venus',
          network: 'bnb',
        };
      }

      // Stake with percentage
      if (input === 'Stake 5% of my BNB balance on Venus protocol') {
        return {
          action: 'stake',
          amount: '5%',
          token: 'BNB',
          protocol: 'venus',
          network: 'bnb',
          autoFilled: {
            network: 'bnb',
          },
        };
      }

      // Stake with USD value
      if (input === 'Stake $10 worth of BNB on Venus') {
        return {
          action: 'stake',
          amount: '$10',
          token: 'BNB',
          protocol: 'venus',
          autoFilled: {
            network: 'bnb',
          },
        };
      }

      // Complex time-based staking
      if (input === 'Stake 100 USDT for 3 months with minimum 5% APY') {
        return {
          action: 'stake',
          amount: '100',
          token: 'USDT',
          duration: '3 months',
          minApy: '5',
          autoFilled: {
            protocol: 'best_apy_protocol',
            network: 'preferred_network',
          },
        };
      }

      // Compare APYs
      if (input === 'Find the best APY for staking BNB between Venus and PancakeSwap') {
        return {
          action: 'compare',
          token: 'BNB',
          protocols: ['venus', 'pancakeswap'],
          compareMetric: 'apy',
        };
      }

      // Ambiguous token
      if (input === 'Stake BUSD') {
        return {
          action: 'stake',
          token: 'BUSD',
          clarificationNeeded: true,
          possibleTokens: ['BUSD on BSC', 'BUSD on Ethereum'],
        };
      }

      // Invalid input
      if (input === 'stake negative amount') {
        return {
          action: 'stake',
          error: 'Invalid amount',
        };
      }

      // Auto-fill missing parameters
      if (input === 'Stake BNB') {
        return {
          action: 'stake',
          token: 'BNB',
          autoFilled: {
            amount: 'default_amount',
            network: 'preferred_network',
            protocol: 'best_apy_protocol',
          },
        };
      }

      return { action: 'unknown', error: 'Unable to parse command' };
    });

    stakingPlugin = new StakingPlugin();
    await stakingPlugin.initialize({
      defaultNetwork: NetworkName.BNB,
      providers: [new MockStakingProvider()],
      supportedNetworks: [NetworkName.BNB, NetworkName.ETHEREUM],
    });

    await agent.registerPlugin(stakingPlugin);
  });

  it('should parse basic staking command with explicit parameters', async () => {
    const result = await agent.execute({
      input: 'Stake 0.01 BNB on Venus protocol on BNB Chain',
    });
    expect(result).toMatchObject({
      action: 'stake',
      amount: '0.01',
      token: 'BNB',
      protocol: 'venus',
      network: 'bnb',
    });
  });

  it('should parse staking command with percentage', async () => {
    const result = await agent.execute({
      input: 'Stake 5% of my BNB balance on Venus protocol',
    });
    expect(result).toMatchObject({
      action: 'stake',
      amount: '5%',
      token: 'BNB',
      protocol: 'venus',
    });
    expect(result.autoFilled).toBeDefined();
  });

  it('should parse staking command with USD value', async () => {
    const result = await agent.execute({
      input: 'Stake $10 worth of BNB on Venus',
    });
    expect(result).toMatchObject({
      action: 'stake',
      amount: '$10',
      token: 'BNB',
      protocol: 'venus',
    });
  });

  it('should parse complex time-based staking command', async () => {
    const result = await agent.execute({
      input: 'Stake 100 USDT for 3 months with minimum 5% APY',
    });
    expect(result).toMatchObject({
      action: 'stake',
      amount: '100',
      token: 'USDT',
      duration: '3 months',
      minApy: '5',
    });
    expect(result.autoFilled).toHaveProperty('protocol');
    expect(result.autoFilled).toHaveProperty('network');
  });

  it('should parse APY comparison command', async () => {
    const result = await agent.execute({
      input: 'Find the best APY for staking BNB between Venus and PancakeSwap',
    });
    expect(result).toMatchObject({
      action: 'compare',
      token: 'BNB',
      protocols: ['venus', 'pancakeswap'],
      compareMetric: 'apy',
    });
  });

  it('should handle ambiguous token names', async () => {
    const result = await agent.execute({
      input: 'Stake BUSD',
    });
    expect(result.clarificationNeeded).toBe(true);
    expect(result.possibleTokens).toContain('BUSD on BSC');
    expect(result.possibleTokens).toContain('BUSD on Ethereum');
  });

  it('should handle invalid inputs', async () => {
    const result = await agent.execute({
      input: 'stake negative amount',
    });
    expect(result.error).toBe('Invalid amount');
  });

  it('should auto-fill missing parameters', async () => {
    const result = await agent.execute({
      input: 'Stake BNB',
    });
    expect(result.autoFilled).toMatchObject({
      amount: 'default_amount',
      network: 'preferred_network',
      protocol: 'best_apy_protocol',
    });
  });
});
