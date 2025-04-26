import { ethers } from 'ethers';
import { Agent, Network, NetworkName, NetworksConfig, settings } from '@binkai/core';
import { beforeEach, describe, expect, it } from 'vitest';
import { Wallet } from '@binkai/core';
import { Connection } from '@solana/web3.js';
import { SwapPlugin } from '../src';
import { JupiterProvider } from '../../../providers/jupiter/src/JupiterProvider';

describe('SwapPlugin', () => {
  let swapPlugin: SwapPlugin;
  let wallet: Wallet;
  let network: Network;
  let jupiterProvider: JupiterProvider;
  let agent: Agent;
  let networks: NetworksConfig['networks'];

  const BNB_RPC = 'https://binance.llamarpc.com';
  const ETH_RPC = 'https://eth.llamarpc.com';
  const SOL_RPC = 'https://api.mainnet-beta.solana.com';
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

    const network = new Network({ networks });
    wallet = new Wallet(
      {
        seedPhrase:
          settings.get('WALLET_MNEMONIC') ||
          'test test test test test test test test test test test junk',
        index: 9,
      },
      network,
    );

    console.log('👛 Wallet ', await wallet.getAddress(NetworkName.SOLANA));

    jupiterProvider = new JupiterProvider(new Connection(SOL_RPC));

    swapPlugin = new SwapPlugin();
    await swapPlugin.initialize({
      defaultNetwork: NetworkName.SOLANA,
      providers: [new JupiterProvider(new Connection(SOL_RPC))],
      supportedNetworks: [NetworkName.SOLANA],
    });

    agent = new Agent(
      {
        model: 'gpt-4',
        temperature: 0,
      },
      wallet,
      networks,
    );

    await agent.registerPlugin(swapPlugin);
  });

  it('Test 1: should execute a swap on Solana network', async () => {
    const params = {
      fromToken: 'So11111111111111111111111111111111111111111', // SOL token address
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', // USDC token address
      amount: '0.05',
      amountType: 'input',
      network: NetworkName.SOLANA,
      provider: 'jupiter',
      slippage: 0.5,
      limitPrice: 0,
    };

    const result = await agent.invokeTool('swap', params);
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    //console.log('🚀 ~ Test 1 ~ parsedResult:', parsedResult);
    expect(parsedResult).toBeDefined();
    expect(parsedResult).toMatchObject({
      status: 'success',
    });
  });

  it('Test 2: should fail with invalid token addresses', async () => {
    const params = {
      fromToken: 'InvalidThisTokenAddress',
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '0.05',
      amountType: 'input',
      network: NetworkName.SOLANA,
      provider: 'jupiter',
      slippage: 0.5,
      limitPrice: 0,
    };

    const result = await agent.invokeTool('swap', params);
    // Parse the JSON string response
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    //console.log('🚀 ~ Test 2 ~ parsedResult:', parsedResult);
    expect(parsedResult).toBeDefined();
    expect(parsedResult).toMatchObject({
      status: 'error',
    });
  });

  it('Test 3: should fail with insufficient balance', async () => {
    const params = {
      fromToken: 'So11111111111111111111111111111111111111111',
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '1000000', // Very large amount
      amountType: 'input',
      network: NetworkName.SOLANA,
      provider: 'jupiter',
      slippage: 0.5,
      limitPrice: 0,
    };

    // const rejectdata = await expect(agent.invokeTool('swap', params)).rejects;
    // console.log('🤖 rejectdata', rejectdata);
    const result = await agent.invokeTool('swap', params);
    // Parse the JSON string response
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    //console.log('🚀 ~ Test 3 ~ parsedResult:', parsedResult);
    expect(parsedResult).toBeDefined();
    expect(parsedResult).toMatchObject({
      status: 'error',
    });
  });

  it('Test 4: should handle output amount type correctly', async () => {
    const params = {
      fromToken: 'So11111111111111111111111111111111111111111',
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '1',
      amountType: 'output',
      network: NetworkName.SOLANA,
      provider: 'jupiter',
      slippage: 0.5,
      limitPrice: 0,
    };

    const result = await agent.invokeTool('swap', params);
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    console.log('🚀 ~ Test 4 ~ parsedResult:', parsedResult);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.status).toBe('success');
  });

  it('Test 5: swap with float amount', async () => {
    const params = {
      fromToken: 'So11111111111111111111111111111111111111111',
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '0.00123243435354546565656',
      amountType: 'input',
      network: NetworkName.SOLANA,
      provider: 'jupiter',
      slippage: 0.5,
      limitPrice: 0,
    };

    const result = await agent.invokeTool('swap', params);
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    //console.log('🚀 ~ Test 5 ~ parsedResult:', parsedResult);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.status).toBe('success');
  });

  it('Test 6: limit order', async () => {
    const params = {
      fromToken: 'So11111111111111111111111111111111111111111',
      toToken: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
      amount: '0.00123243435354546565656',
      amountType: 'input',
      network: NetworkName.SOLANA,
      provider: 'jupiter',
      slippage: 0.5,
      limitPrice: 100,
    };

    const result = await agent.invokeTool('swap', params);
    const parsedResult = typeof result === 'string' ? JSON.parse(result) : result;
    console.log('🚀 ~ Test 6 ~ parsedResult:', parsedResult);
    expect(parsedResult).toBeDefined();
    expect(parsedResult.status).toBe('success');
  });
});
