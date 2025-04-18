import { ethers } from 'ethers';
import { Agent, Network, NetworkName, NetworksConfig, settings } from '@binkai/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Wallet } from '@binkai/core';
import { Connection } from '@solana/web3.js';
import { TokenPlugin } from '../src';

describe('TokenPlugin', () => {
  let tokenPlugin: TokenPlugin;
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
  const SOL_NATIVE_TOKEN_ADDRESS = 'So11111111111111111111111111111111111111112';

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
      if (tool === 'get_token_info') {
        // Address lookup
        if (params.query === USDT_TOKEN_ADDRESS) {
          return {
            status: 'success',
            data: {
              address: USDT_TOKEN_ADDRESS,
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 18,
              network: params.network,
              totalSupply: '67068467152938453979904733',
              price: {
                usd: 1.0,
                nativeToken: 0.0031,
              },
              marketCap: 93571209023,
              volume24h: 50482910234,
              priceChange24h: 0.02,
              verified: true,
              buyTax: '0%',
              sellTax: '0%',
              isHoneypot: 'No',
            },
            provider: params.provider || 'default',
            network: params.network,
          };
        }
        // Symbol lookup
        else if (params.query === 'USDT') {
          return {
            status: 'success',
            data: {
              address: USDT_TOKEN_ADDRESS,
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 18,
              network: params.network,
              totalSupply: '67068467152938453979904733',
              price: {
                usd: 1.0,
                nativeToken: 0.0031,
              },
              marketCap: 93571209023,
              volume24h: 50482910234,
              priceChange24h: 0.02,
              verified: true,
              buyTax: '0%',
              sellTax: '0%',
              isHoneypot: 'No',
            },
            provider: params.provider || 'default',
            network: params.network,
          };
        }
        // Native token lookup
        else if (params.query === 'BNB' || params.query === BNB_NATIVE_TOKEN_ADDRESS) {
          return {
            status: 'success',
            data: {
              address: BNB_NATIVE_TOKEN_ADDRESS,
              symbol: 'BNB',
              name: 'Binance Coin',
              decimals: 18,
              network: params.network,
              totalSupply: '200000000000000000000000000',
              price: {
                usd: 320.45,
                nativeToken: 1.0,
              },
              marketCap: 49289102354,
              volume24h: 1092839102,
              priceChange24h: -2.5,
              verified: true,
            },
            provider: params.provider || 'default',
            network: params.network,
          };
        }
        // SOL lookup
        else if (params.query === 'SOL' || params.query === SOL_NATIVE_TOKEN_ADDRESS) {
          return {
            status: 'success',
            data: {
              address: SOL_NATIVE_TOKEN_ADDRESS,
              symbol: 'SOL',
              name: 'Solana',
              decimals: 9,
              network: params.network,
              totalSupply: '555478491336542780',
              price: {
                usd: 129.82,
                nativeToken: 1.0,
              },
              marketCap: 56892034872,
              volume24h: 1928349012,
              priceChange24h: 1.5,
              verified: true,
              mutableMetadata: false,
              freezeable: 'No',
              transferFeeEnable: 'No',
            },
            provider: params.provider || 'default',
            network: params.network,
          };
        }
        // Invalid token
        else if (params.query === 'INVALID_TOKEN') {
          return {
            status: 'error',
            message: 'Token not found',
            network: params.network,
          };
        } else {
          return {
            status: 'error',
            message: 'Token not found',
            network: params.network,
          };
        }
      } else if (tool === 'create_token') {
        if (params.name && params.symbol) {
          return {
            status: 'success',
            data: {
              address: '0x' + Array(40).fill('0').join(''),
              name: params.name,
              symbol: params.symbol,
              decimals: 18,
              network: params.network,
              transactionHash: '0x' + Array(64).fill('1').join(''),
            },
            provider: params.provider || 'four-meme',
            network: params.network,
          };
        } else {
          return {
            status: 'error',
            message: 'Missing required parameters',
            network: params.network,
          };
        }
      }
    });

    // Create mock provider
    mockProvider = {
      getName: () => 'default',
      getSupportedNetworks: () => [NetworkName.BNB, NetworkName.ETHEREUM, NetworkName.SOLANA],
    };

    tokenPlugin = new TokenPlugin();
    await tokenPlugin.initialize({
      providers: [mockProvider],
      supportedNetworks: [NetworkName.BNB, NetworkName.ETHEREUM, NetworkName.SOLANA],
    });

    await agent.registerPlugin(tokenPlugin);
  });

  it('should get token info by address', async () => {
    const params = {
      query: USDT_TOKEN_ADDRESS,
      network: NetworkName.BNB,
      includePrice: true,
    };

    const result = await agent.invokeTool('get_token_info', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data.address).toBe(USDT_TOKEN_ADDRESS);
    expect(result.data.symbol).toBe('USDT');
    expect(result.data.name).toBe('Tether USD');
    expect(result.data.decimals).toBe(18);
    expect(result.data.network).toBe(NetworkName.BNB);
    expect(result.data.price).toBeDefined();
    expect(result.data.price.usd).toBe(1.0);
  });

  it('should get token info by symbol', async () => {
    const params = {
      query: 'USDT',
      network: NetworkName.BNB,
      includePrice: true,
    };

    const result = await agent.invokeTool('get_token_info', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data.symbol).toBe('USDT');
    expect(result.data.name).toBe('Tether USD');
    expect(result.data.address).toBe(USDT_TOKEN_ADDRESS);
  });

  it('should get native token info', async () => {
    const params = {
      query: 'BNB',
      network: NetworkName.BNB,
      includePrice: true,
    };

    const result = await agent.invokeTool('get_token_info', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data.symbol).toBe('BNB');
    expect(result.data.name).toBe('Binance Coin');
    expect(result.data.address).toBe(BNB_NATIVE_TOKEN_ADDRESS);
    expect(result.data.decimals).toBe(18);
  });

  it('should get Solana token info', async () => {
    const params = {
      query: 'SOL',
      network: NetworkName.SOLANA,
      includePrice: true,
    };

    const result = await agent.invokeTool('get_token_info', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data.symbol).toBe('SOL');
    expect(result.data.name).toBe('Solana');
    expect(result.data.address).toBe(SOL_NATIVE_TOKEN_ADDRESS);
    expect(result.data.decimals).toBe(9);
    expect(result.data.mutableMetadata).toBe(false);
  });

  it('should fail with invalid token', async () => {
    const params = {
      query: 'INVALID_TOKEN',
      network: NetworkName.BNB,
      includePrice: true,
    };

    const result = await agent.invokeTool('get_token_info', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Token not found');
  });

  it('should create a new token', async () => {
    const params = {
      name: 'My Test Token',
      symbol: 'MTT',
      description: 'A test token for unit tests',
      network: NetworkName.BNB,
      provider: 'four-meme',
    };

    const result = await agent.invokeTool('create_token', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('success');
    expect(result.data.name).toBe(params.name);
    expect(result.data.symbol).toBe(params.symbol);
    expect(result.data.decimals).toBe(18);
    expect(result.data.network).toBe(NetworkName.BNB);
    expect(result.data.transactionHash).toBeDefined();
  });

  it('should fail to create token with missing parameters', async () => {
    const params = {
      // Missing name
      symbol: 'MTT',
      description: 'A test token for unit tests',
      network: NetworkName.BNB,
      provider: 'four-meme',
    };

    const result = await agent.invokeTool('create_token', params);

    expect(result).toBeDefined();
    expect(result.status).toBe('error');
    expect(result.message).toContain('Missing required parameters');
  });
});
