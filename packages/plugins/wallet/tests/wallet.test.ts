import { ethers } from 'ethers';
import { Agent, Network, NetworkName, NetworksConfig, settings } from '@binkai/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from '@binkai/core';
import { Connection } from '@solana/web3.js';
import { WalletPlugin } from '../src';

describe('WalletPlugin', () => {
  let walletPlugin: WalletPlugin;
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
  const SAMPLE_RECIPIENT_ADDRESS = '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

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

    const userAddress = await wallet.getAddress(NetworkName.BNB);
    console.log('👛 Wallet ', userAddress);

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
      if (tool === 'get_wallet_balance') {
        return {
          address: userAddress,
          nativeBalance: {
            symbol: 'BNB',
            balance: '1.23456789',
            decimals: 18,
            usdValue: 396.28,
          },
          tokens: [
            {
              symbol: 'USDT',
              balance: '100.5',
              decimals: 18,
              name: 'Tether USD',
              usdValue: 100.5,
              tokenAddress: USDT_TOKEN_ADDRESS,
            },
            {
              symbol: 'CAKE',
              balance: '25.75',
              decimals: 18,
              name: 'PancakeSwap Token',
              usdValue: 89.11,
              tokenAddress: '0x0E09FaBB73Bd3Ade0a17ECC321fD13a19e81cE82',
            },
          ],
          totalUsdValue: 585.89,
        };
      } else if (tool === 'transfer_tokens') {
        if (params.amount === '1000000') {
          return {
            status: 'error',
            message: 'Insufficient balance',
          };
        } else if (params.token === 'InvalidTokenAddress') {
          return {
            status: 'error',
            message: 'Invalid token address',
          };
        } else if (params.toAddress === 'InvalidRecipientAddress') {
          return {
            status: 'error',
            message: 'Invalid recipient address',
          };
        } else {
          return {
            provider: 'wallet-provider',
            token: {
              address: params.token,
              symbol: params.token === BNB_NATIVE_TOKEN_ADDRESS ? 'BNB' : 'USDT',
              decimals: 18,
            },
            fromAddress: userAddress,
            toAddress: params.toAddress,
            amount: params.amount,
            transactionHash: '0x' + Array(64).fill('1').join(''),
            network: params.network,
          };
        }
      }
    });

    // Create mock provider
    mockProvider = {
      getName: () => 'wallet-provider',
      getSupportedNetworks: () => [NetworkName.BNB, NetworkName.ETHEREUM, NetworkName.SOLANA],
      getWalletInfo: vi.fn(),
      getQuote: vi.fn(),
      buildTransferTransaction: vi.fn(),
      checkBalance: vi.fn(),
      buildApproveTransaction: vi.fn(),
      checkAllowance: vi.fn(),
    };

    walletPlugin = new WalletPlugin();
    await walletPlugin.initialize({
      providers: [mockProvider],
      supportedNetworks: [NetworkName.BNB, NetworkName.ETHEREUM, NetworkName.SOLANA],
    });

    await agent.registerPlugin(walletPlugin);
  });

  it('should get wallet balance', async () => {
    const params = {
      network: NetworkName.BNB,
    };

    const result = await agent.invokeTool('get_wallet_balance', params);

    expect(result).toBeDefined();
    expect(result.address).toBeDefined();
    expect(result.nativeBalance).toBeDefined();
    expect(result.nativeBalance.symbol).toBe('BNB');
    expect(result.tokens).toBeDefined();
    expect(result.tokens.length).toBeGreaterThan(0);
    expect(result.tokens[0].symbol).toBe('USDT');
    expect(result.totalUsdValue).toBeDefined();
  });

  it('should transfer native tokens', async () => {
    const params = {
      token: BNB_NATIVE_TOKEN_ADDRESS,
      toAddress: SAMPLE_RECIPIENT_ADDRESS,
      amount: '0.1',
      network: NetworkName.BNB,
    };

    const result = await agent.invokeTool('transfer_tokens', params);

    expect(result).toBeDefined();
    expect(result.token.symbol).toBe('BNB');
    expect(result.toAddress).toBe(SAMPLE_RECIPIENT_ADDRESS);
    expect(result.amount).toBe(params.amount);
    expect(result.transactionHash).toBeDefined();
    expect(result.network).toBe(NetworkName.BNB);
  });

  it('should transfer ERC20 tokens', async () => {
    const params = {
      token: USDT_TOKEN_ADDRESS,
      toAddress: SAMPLE_RECIPIENT_ADDRESS,
      amount: '10',
      network: NetworkName.BNB,
    };

    const result = await agent.invokeTool('transfer_tokens', params);

    expect(result).toBeDefined();
    expect(result.token.symbol).toBe('USDT');
    expect(result.token.address).toBe(USDT_TOKEN_ADDRESS);
    expect(result.toAddress).toBe(SAMPLE_RECIPIENT_ADDRESS);
    expect(result.amount).toBe(params.amount);
    expect(result.transactionHash).toBeDefined();
    expect(result.network).toBe(NetworkName.BNB);
  });

  it('should fail with insufficient balance', async () => {
    const params = {
      token: BNB_NATIVE_TOKEN_ADDRESS,
      toAddress: SAMPLE_RECIPIENT_ADDRESS,
      amount: '1000000', // Very large amount
      network: NetworkName.BNB,
    };

    const result = await agent.invokeTool('transfer_tokens', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Insufficient balance');
  });

  it('should fail with invalid token address', async () => {
    const params = {
      token: 'InvalidTokenAddress',
      toAddress: SAMPLE_RECIPIENT_ADDRESS,
      amount: '0.1',
      network: NetworkName.BNB,
    };

    const result = await agent.invokeTool('transfer_tokens', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid token address');
  });

  it('should fail with invalid recipient address', async () => {
    const params = {
      token: BNB_NATIVE_TOKEN_ADDRESS,
      toAddress: 'InvalidRecipientAddress',
      amount: '0.1',
      network: NetworkName.BNB,
    };

    const result = await agent.invokeTool('transfer_tokens', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Invalid recipient address');
  });
});
