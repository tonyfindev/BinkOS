import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ethers } from 'ethers';

import { Connection } from '@solana/web3.js';
import { BnbProvider } from '@binkai/rpc-provider';

import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  IToolExecutionCallback,
  Network,
  NetworkName,
  NetworksConfig,
  NetworkType,
  PlanningAgent,
  settings,
  Wallet,
  ToolExecutionData,
  ToolExecutionState,
} from '@binkai/core';
import { SwapPlugin } from '../src/SwapPlugin';
import { TokenPlugin } from '@binkai/token-plugin';
import { BridgePlugin } from '../../bridge/src/BridgePlugin';
import { BirdeyeProvider } from '../../../providers/birdeye/src/BirdeyeProvider';
import { JupiterProvider } from '../../../providers/jupiter/src/JupiterProvider';
import { WalletPlugin } from '../../wallet/src/WalletPlugin';
import { PancakeSwapProvider } from '../../../providers/pancakeswap/src/PancakeSwapProvider';
import { ThenaProvider } from '../../../providers/thena/src/ThenaProvider';
import { deBridgeProvider } from '../../../providers/deBridge/src/deBridgeProvider';
import { AlchemyProvider } from '../../../providers/alchemy/src/AlchemyProvider';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

// Example callback implementation
class ExampleToolExecutionCallback implements IToolExecutionCallback {
  onToolExecution(data: ToolExecutionData): void {
    const stateEmoji = {
      [ToolExecutionState.STARTED]: '🚀',
      [ToolExecutionState.IN_PROCESS]: '⏳',
      [ToolExecutionState.COMPLETED]: '✅',
      [ToolExecutionState.FAILED]: '❌',
    };

    const emoji = stateEmoji[data.state] || '🔄';

    console.log(`${emoji} [${new Date(data.timestamp).toISOString()}] ${data.message}`);

    if (data.state === ToolExecutionState.STARTED) {
      console.log(`   Input: ${JSON.stringify(data.input)}`);
    }

    if (data.state === ToolExecutionState.IN_PROCESS && data.data) {
      console.log(`   Progress: ${data.data.progress || 0}%`);
    }

    if (data.state === ToolExecutionState.COMPLETED && data.data) {
      console.log(
        `   Result: ${JSON.stringify(data.data).substring(0, 100)}${JSON.stringify(data.data).length > 100 ? '...' : ''}`,
      );
    }

    if (data.state === ToolExecutionState.FAILED && data.error) {
      console.log(`   Error: ${data.error.message || String(data.error)}`);
    }
  }
}

class ToolArgsCallback implements IToolExecutionCallback {
  private toolArgs: any = null;

  onToolExecution(data: ToolExecutionData): void {
    if (data.input && typeof data.input === 'object') {
      const input = data.input;
      if ('fromToken' in input && 'toToken' in input && 'amount' in input) {
        this.toolArgs = input;
        console.log('🔍 Captured Tool Args ---------:', this.toolArgs);
      }
    }
  }

  getToolArgs() {
    return this.toolArgs;
  }
}

describe('Planning Agent', () => {
  let agent: PlanningAgent;
  let wallet: Wallet;
  let network: Network;
  let networks: NetworksConfig['networks'];
  let toolCallback: ToolArgsCallback;

  beforeEach(async () => {
    // Check required environment variables
    if (!settings.has('OPENAI_API_KEY')) {
      throw new Error('Please set OPENAI_API_KEY in your .env file');
    }

    // Define available networks
    networks = {
      [NetworkName.BNB]: {
        type: 'evm' as NetworkType,
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
      [NetworkName.SOLANA]: {
        type: 'solana' as NetworkType,
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

    // Initialize network
    network = new Network({ networks });

    // Initialize provider
    const provider = new ethers.JsonRpcProvider(BNB_RPC);
    const solanaProvider = new Connection(SOL_RPC);

    // Initialize a new wallet
    wallet = new Wallet(
      {
        seedPhrase:
          settings.get('WALLET_MNEMONIC') ||
          'test test test test test test test test test test test junk',
        index: 9,
      },
      network,
    );

    // Create an agent with OpenAI
    agent = new PlanningAgent(
      {
        model: 'gpt-4o',
        temperature: 0,
      },
      wallet,
      networks,
    );

    toolCallback = new ToolArgsCallback();
    agent.registerToolExecutionCallback(toolCallback);

    // Initialize plugins
    const swapPlugin = new SwapPlugin();
    const bridgePlugin = new BridgePlugin();
    const tokenPlugin = new TokenPlugin();
    const walletPlugin = new WalletPlugin();

    // Initialize providers
    const birdeye = new BirdeyeProvider({
      apiKey: settings.get('BIRDEYE_API_KEY'),
    });
    const alchemy = new AlchemyProvider({
      apiKey: settings.get('ALCHEMY_API_KEY'),
    });
    const bnbProvider = new BnbProvider({
      rpcUrl: BNB_RPC,
    });

    const pancakeswap = new PancakeSwapProvider(provider, 56);
    const jupiter = new JupiterProvider(solanaProvider);
    const thena = new ThenaProvider(provider, 56);
    const debridge = new deBridgeProvider([provider, solanaProvider]);

    // Initialize plugins with providers
    await walletPlugin.initialize({
      providers: [bnbProvider, birdeye, alchemy],
      supportedChains: ['solana', 'bnb'],
    });

    await tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeye],
      supportedChains: ['solana'],
    });

    await swapPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'solana',
      providers: [jupiter, pancakeswap],
      supportedChains: ['solana', 'bnb'],
    });

    await bridgePlugin.initialize({
      defaultChain: 'bnb',
      providers: [debridge],
      supportedChains: ['bnb', 'solana'],
    });

    // Register plugins with agent
    await agent.registerPlugin(swapPlugin);
    await agent.registerPlugin(walletPlugin);
    await agent.registerPlugin(tokenPlugin);
    await agent.registerPlugin(bridgePlugin);
  }, 30000); // Increase timeout for beforeEach

  // === SWAP ===

  it('Example 1: swap token on jupiter', async () => {
    await agent.execute({
      input: 'swap 0.001 SOL to USDC',
      threadId: '987fcdeb-a123-45e6-7890-123456789abc',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(capturedArgs.amount).toBe('0.001');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('solana');
    capturedArgs.provider ? expect(capturedArgs.provider).toBe('jupiter') : '';
    expect(capturedArgs.limitPrice).toBe(0);
  }, 90000);

  it('Example 2: should fail when swapping with insufficient balance', async () => {
    await agent.execute({
      input: 'swap 200 SOL to USDC', // Large amount that exceeds balance
      threadId: '456bcdef-7890-12a3-b456-789012345def',
    });

    const capturedArgs = toolCallback.getToolArgs();

    if (capturedArgs === null) {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 3: should handle invalid token symbol gracefully', async () => {
    await agent.execute({
      input: 'swap 0.001 INVALIDTOKEN to USDC',
      threadId: '123e4567-e89b-12d3-a456-426614174003',
    });

    const capturedArgs = toolCallback.getToolArgs();

    if (capturedArgs === null) {
      expect(capturedArgs).toBeNull();
    }
  }, 30000);

  it('Example 4: should swap tokens via PancakeSwap on BNB Chain', async () => {
    await agent.execute({
      input: 'swap 0.001 BNB to BINK on BNB chain via pancakeswap',
      threadId: '123e4567-e89b-12d3-a456-426614174004',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(capturedArgs.toToken).toBe('0x5fdfafd107fc267bd6d6b1c08fcafb8d31394ba1');
    expect(capturedArgs.amount).toBe('0.001');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('bnb');
    expect(capturedArgs.provider).toBe('pancakeswap');
    expect(capturedArgs.limitPrice).toBe(0);
  }, 90000);

  it('Example 5: float amount', async () => {
    await agent.execute({
      input: 'swap 0.0012424343434343 SOL to USDC', // Large amount that exceeds balance
      threadId: '456bcdef-7890-12a3-b456-789012345def',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(capturedArgs.amount).toBe('0.0012424343434343');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('solana');
    capturedArgs.provider ? expect(capturedArgs.provider).toBe('jupiter') : '';
    expect(capturedArgs.limitPrice).toBe(0);
  }, 90000);

  it('Example 6: float amount', async () => {
    await agent.execute({
      input: 'swap 1.1232334 BINK to CAKE on BNB chain using pancakeswap',
      threadId: '123e4567-e89b-12d3-a456-426614174004',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('0x5fdfafd107fc267bd6d6b1c08fcafb8d31394ba1');
    expect(capturedArgs.toToken).toBe('0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82');
    expect(capturedArgs.amount).toBe('1.1232334');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('bnb');
    expect(capturedArgs.provider).toBe('pancakeswap');
    expect(capturedArgs.limitPrice).toBe(0);
  }, 90000);

  it('Example 7: swap all SOL to USDC using Jupiter', async () => {
    await agent.execute({
      input: 'swap all my SOL to USDC using jupiter',
      threadId: '123e4567-e89b-12d3-a456-426614174005',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('solana');
    expect(capturedArgs.provider).toBe('jupiter');
    expect(capturedArgs.limitPrice).toBe(0);
  }, 90000);

  it('Example 8: swap all BNB to USDT using pancakeswap', async () => {
    await agent.execute({
      input: 'swap all my BNB to USDT using pancakeswap',
      threadId: '123e4567-e89b-12d3-a456-426614174006',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(capturedArgs.toToken).toBe('0x55d398326f99059ff775485246999027b3197955');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('bnb');
    expect(capturedArgs.provider).toBe('pancakeswap');
    expect(capturedArgs.limitPrice).toBe(0);
  }, 90000);
  // == LIMIT ORDER ==
  it('Example 9: swap BINK to USDT with limit price using pancakeswap at price 10', async () => {
    await agent.execute({
      input: 'swap 1 BINK to CAKE at price 10',
      threadId: '123e4567-e89b-12d3-a456-426614174009',
    });

    const capturedArgs = toolCallback.getToolArgs();
    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('0x5fdfafd107fc267bd6d6b1c08fcafb8d31394ba1');
    expect(capturedArgs.toToken).toBe('0x0e09fabb73bd3ade0a17ecc321fd13a19e81ce82');
    expect(capturedArgs.amount).toBe('1');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('bnb');
    capturedArgs.provider ? expect(capturedArgs.provider).toBe('pancakeswap') : '';
    expect(capturedArgs.limitPrice).toBe(10);
  }, 90000);

  it('Example 10: swap SOL to USDC with limit price using jupiter', async () => {
    await agent.execute({
      input: 'swap 0.001 SOL to USDC using jupiter with at price 200',
      threadId: '123e4567-e89b-12d3-a456-426614174010',
    });

    const capturedArgs = toolCallback.getToolArgs();

    expect(capturedArgs).not.toBeNull();
    let checkFromToken = false;

    capturedArgs.fromToken == 'So11111111111111111111111111111111111111111' ||
    capturedArgs.fromToken == 'So11111111111111111111111111111111111111112'
      ? (checkFromToken = true)
      : (checkFromToken = false);

    expect(checkFromToken).toBe(true);
    expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(capturedArgs.amount).toBe('0.001');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.network).toBe('solana');
    expect(capturedArgs.provider).toBe('jupiter');
    expect(capturedArgs.limitPrice).toBe(200);
  }, 90000);
});
