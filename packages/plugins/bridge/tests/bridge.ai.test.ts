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
} from '@binkai/core';
import { ToolExecutionData } from '@binkai/core';
import { ToolExecutionState } from '@binkai/core';
import { SwapPlugin } from '../../swap/dist/SwapPlugin';
import { BridgePlugin } from '../src/BridgePlugin';
import { TokenPlugin } from '../../token/src/TokenPlugin';
import { WalletPlugin } from '../../wallet/src/WalletPlugin';
import { BirdeyeProvider } from '../../../providers/birdeye/src/BirdeyeProvider';
import { deBridgeProvider } from '../../../providers/deBridge/src/deBridgeProvider';
import { PancakeSwapProvider } from '../../../providers/pancakeswap/src/PancakeSwapProvider';
import { JupiterProvider } from '../../../providers/jupiter/src/JupiterProvider';
import { ThenaProvider } from '../../../providers/thena/src/ThenaProvider';

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
    const bnbProvider = new BnbProvider({
      rpcUrl: BNB_RPC,
    });

    const pancakeswap = new PancakeSwapProvider(provider, 56);
    const jupiter = new JupiterProvider(solanaProvider);
    const thena = new ThenaProvider(provider, 56);
    const debridge = new deBridgeProvider([provider, solanaProvider]);

    // Initialize plugins with providers
    await walletPlugin.initialize({
      providers: [bnbProvider, birdeye],
      supportedChains: ['solana', 'bnb'],
    });

    await tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeye],
      supportedChains: ['solana'],
    });

    await bridgePlugin.initialize({
      defaultChain: 'bnb',
      providers: [debridge],
      supportedChains: ['bnb', 'solana'],
    });

    await swapPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'solana',
      providers: [jupiter, pancakeswap],
      supportedChains: ['solana', 'bnb'],
    });

    // Register plugins with agent
    await agent.registerPlugin(swapPlugin);
    await agent.registerPlugin(walletPlugin);
    await agent.registerPlugin(tokenPlugin);
    await agent.registerPlugin(bridgePlugin);
  }, 30000); // Increase timeout for beforeEach

  // // === BRIDGE ===

  it('Example 1: should handle bridge request between chains', async () => {
    const result = await agent.execute({
      input: 'bridge 0.001 SOL to BNB chain',
      threadId: '123e4567-e89b-12d3-a456-426614174002',
    });
    const capturedArgs = toolCallback.getToolArgs();
    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(capturedArgs.toToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(capturedArgs.amount).toBe('0.001');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.fromNetwork).toBe('solana');
    expect(capturedArgs.toNetwork).toBe('bnb');
  }, 90000);

  it('Example 2:should handle bridge with specific amount and token', async () => {
    await agent.execute({
      input: 'bridge 0.0002 BNB to SOL using debridge',
      threadId: '123e4567-e89b-12d3-a456-426614174005',
    });
    const capturedArgs = toolCallback.getToolArgs();
    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(capturedArgs.toToken).toBe('So11111111111111111111111111111111111111112');
    expect(capturedArgs.amount).toBe('0.0002');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.fromNetwork).toBe('bnb');
    expect(capturedArgs.toNetwork).toBe('solana');
  }, 90000);

  it('Example 3:should handle bridge with insufficient liquidity', async () => {
    const result = await agent.execute({
      input: 'bridge 0.0003 SOL to BNB chain',
      threadId: '123e4567-e89b-12d3-a456-426614174006',
    });
    const capturedArgs = toolCallback.getToolArgs();
    expect(capturedArgs).toBeDefined();
    expect(capturedArgs.fromNetwork).toBe('solana');
    expect(capturedArgs.toNetwork).toBe('bnb');
    expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(capturedArgs.toToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(capturedArgs.amountType).toBe('input');
    expect(capturedArgs.amount).toBe('0.0003');
  }, 90000);
});
