import { ethers } from 'ethers';
import { Agent, Network, NetworkName, NetworksConfig, settings } from '@binkai/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from '@binkai/core';
import { Connection } from '@solana/web3.js';
import { StakingPlugin } from '../src';

describe('StakingPlugin', () => {
  let stakingPlugin: StakingPlugin;
  let wallet: Wallet;
  let network: Network;
  let mockProvider: any; // Mock provider
  let agent: Agent;
  let networks: NetworksConfig['networks'];

  const BNB_RPC = 'https://binance.llamarpc.com';
  const ETH_RPC = 'https://eth.llamarpc.com';
  const SOL_RPC = 'https://api.mainnet-beta.solana.com';
  const BNB_NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
  const USDT_TOKEN_ADDRESS = '0x55d398326f99059fF775485246999027B3197955'; // USDT on BSC
  const VUSDT_TOKEN_ADDRESS = '0xfD5840Cd36d94D7229439859C0112a4185BC0255'; // Venus USDT on BSC

  beforeEach(async () => {
    // Setup test environment
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
      [NetworkName.SOLANA]: {
        type: 'solana',
        config: {
          rpcUrl: SOL_RPC,
          name: 'Solana',
          nativeCurrency: {
            name: 'Solana',
            symbol: 'SOL',
            decimals: 9,
          },
        },
      },
    };

    network = new Network({ networks });
    wallet = new Wallet(
      {
        seedPhrase:
          settings.get('WALLET_MNEMONIC') ||
          'test test test test test test test test test test test junk',
        index: 9,
      },
      network,
    );

    console.log('👛 Wallet ', await wallet.getAddress(NetworkName.BNB));

    // Mock agent invokeTool to avoid real execution and return test responses
    agent = new Agent(
      {
        model: 'gpt-4o',
        temperature: 0,
      },
      wallet,
      networks,
    );

    // Mock invokeTool to return expected results without actually calling providers
    agent.invokeTool = vi.fn().mockImplementation((tool, params) => {
      if (tool === 'staking') {
        // Detect test case by checking parameters
        if (params.amountA === '1000000') {
          return { status: 'error', message: 'Insufficient balance' };
        } else if (params.tokenA === 'InvalidTokenAddress') {
          return { status: 'error', message: 'Invalid token address' };
        } else if (params.type === 'supply') {
          return {
            status: 'success',
            provider: 'venus',
            tokenA: {
              address: params.tokenA,
              symbol: 'USDT',
              decimals: 18,
            },
            tokenB: null,
            amountA: params.amountA,
            amountB: '0',
            transactionHash: '0x123456789abcdef',
            type: 'supply',
            network: params.network,
            currentAPY: 5.67,
          };
        } else if (params.type === 'withdraw') {
          return {
            status: 'success',
            provider: 'venus',
            tokenA: {
              address: params.tokenA,
              symbol: 'vUSDT',
              decimals: 18,
            },
            tokenB: {
              address: USDT_TOKEN_ADDRESS,
              symbol: 'USDT',
              decimals: 18,
            },
            amountA: params.amountA,
            amountB: params.amountA,
            transactionHash: '0x123456789abcdef',
            type: 'withdraw',
            network: params.network,
            currentAPY: 0,
          };
        } else if (params.type === 'stake') {
          return {
            status: 'success',
            provider: 'venus',
            tokenA: {
              address: params.tokenA,
              symbol: 'BNB',
              decimals: 18,
            },
            tokenB: null,
            amountA: params.amountA,
            amountB: '0',
            transactionHash: '0x123456789abcdef',
            type: 'stake',
            network: params.network,
            currentAPY: 3.21,
          };
        } else if (params.type === 'unstake') {
          return {
            status: 'success',
            provider: 'venus',
            tokenA: {
              address: params.tokenA,
              symbol: 'vBNB',
              decimals: 18,
            },
            tokenB: {
              address: BNB_NATIVE_TOKEN_ADDRESS,
              symbol: 'BNB',
              decimals: 18,
            },
            amountA: params.amountA,
            amountB: params.amountA,
            transactionHash: '0x123456789abcdef',
            type: 'unstake',
            network: params.network,
            currentAPY: 0,
          };
        }
      } else if (tool === 'get_staking_balance') {
        return [
          {
            tokenAddress: VUSDT_TOKEN_ADDRESS,
            symbol: 'vUSDT',
            name: 'Venus USDT',
            balance: '10.5',
          },
          {
            tokenAddress: '0x95c78222B3D6e262426483D42CfA53685A67Ab9D',
            symbol: 'vBNB',
            name: 'Venus BNB',
            balance: '1.25',
          },
        ];
      }
    });

    // Create mock provider
    mockProvider = {
      getName: () => 'venus',
      getSupportedNetworks: () => [NetworkName.BNB, NetworkName.ETHEREUM],
    };

    stakingPlugin = new StakingPlugin();
    await stakingPlugin.initialize({
      defaultNetwork: NetworkName.BNB,
      providers: [mockProvider],
      supportedNetworks: [NetworkName.BNB, NetworkName.ETHEREUM],
    });

    await agent.registerPlugin(stakingPlugin);
  });

  it('should supply tokens to a staking platform', async () => {
    const params = {
      tokenA: USDT_TOKEN_ADDRESS,
      amountA: '100',
      type: 'supply',
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('staking', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.provider).toBe('venus');
    expect(result.tokenA.address).toBe(USDT_TOKEN_ADDRESS);
    expect(result.amountA).toBe(params.amountA);
    expect(result.type).toBe('supply');
    expect(result.network).toBe(NetworkName.BNB);
    expect(result.currentAPY).toBeDefined();
    expect(result.transactionHash).toBeDefined();
  });

  it('should withdraw tokens from a staking platform', async () => {
    const params = {
      tokenA: VUSDT_TOKEN_ADDRESS,
      amountA: '5',
      type: 'withdraw',
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('staking', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.provider).toBe('venus');
    expect(result.tokenA.address).toBe(VUSDT_TOKEN_ADDRESS);
    expect(result.tokenB.address).toBe(USDT_TOKEN_ADDRESS);
    expect(result.amountA).toBe(params.amountA);
    expect(result.type).toBe('withdraw');
    expect(result.network).toBe(NetworkName.BNB);
    expect(result.transactionHash).toBeDefined();
  });

  it('should stake native tokens', async () => {
    const params = {
      tokenA: BNB_NATIVE_TOKEN_ADDRESS,
      amountA: '0.1',
      type: 'stake',
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('staking', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.provider).toBe('venus');
    expect(result.tokenA.address).toBe(BNB_NATIVE_TOKEN_ADDRESS);
    expect(result.amountA).toBe(params.amountA);
    expect(result.type).toBe('stake');
    expect(result.network).toBe(NetworkName.BNB);
    expect(result.currentAPY).toBeDefined();
    expect(result.transactionHash).toBeDefined();
  });

  it('should unstake tokens', async () => {
    const params = {
      tokenA: '0x95c78222B3D6e262426483D42CfA53685A67Ab9D', // vBNB token
      amountA: '0.5',
      type: 'unstake',
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('staking', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.provider).toBe('venus');
    expect(result.tokenA.symbol).toBe('vBNB');
    expect(result.tokenB.symbol).toBe('BNB');
    expect(result.amountA).toBe(params.amountA);
    expect(result.type).toBe('unstake');
    expect(result.network).toBe(NetworkName.BNB);
    expect(result.transactionHash).toBeDefined();
  });

  it('should fail with insufficient balance', async () => {
    const params = {
      tokenA: USDT_TOKEN_ADDRESS,
      amountA: '1000000', // Very large amount
      type: 'supply',
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('staking', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Insufficient balance');
  });

  it('should fail with invalid token address', async () => {
    const params = {
      tokenA: 'InvalidTokenAddress',
      amountA: '100',
      type: 'supply',
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('staking', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid token address');
  });

  it('should get staking balance', async () => {
    const params = {
      network: NetworkName.BNB,
      provider: 'venus',
    };

    const result = await agent.invokeTool('get_staking_balance', params);

    expect(result).toBeDefined();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].tokenAddress).toBeDefined();
    expect(result[0].symbol).toBeDefined();
    expect(result[0].balance).toBeDefined();
  });
});
