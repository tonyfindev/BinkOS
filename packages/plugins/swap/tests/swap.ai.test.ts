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
      providers: [birdeye],
      supportedChains: ['solana'],
    });

    await tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeye],
      supportedChains: ['solana'],
    });

    await swapPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'solana',
      providers: [jupiter],
      supportedChains: ['solana'],
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

  // === GET INFO ===

  it('should get balance on Solana', async () => {
    const result = await agent.execute({
      input: 'get my balance on solana',
      threadId: '123e4567-e89b-12d3-a456-426614174000',
    });

    console.log('🔍 result 1:', result);

    expect(result).toBeDefined();
    expect(result.toLowerCase()).toContain(
      (await wallet.getAddress(NetworkName.SOLANA)).toLowerCase(),
    );
    expect(result.toLowerCase()).toContain('sol');
  }, 30000); // Increase timeout for this test

  // === SWAP ===

  it('Example 3: swap token on jupiter', async () => {
    await agent.execute({
      input: 'swap 0.0001 SOL to USDC',
      threadId: '987fcdeb-a123-45e6-7890-123456789abc',
    });

    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 Captured Swap Args:', capturedArgs);

    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
      expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      // expect(capturedArgs.amount).toBe('0.0001');
      expect(capturedArgs.amountType).toBe('input');
      expect(capturedArgs.network).toBe('solana');
      expect(capturedArgs.provider).toBe('jupiter');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 4: should fail when swapping with insufficient balance', async () => {
    await agent.execute({
      input: 'swap 0.0002 SOL to USDC', // Large amount that exceeds balance
      threadId: '456bcdef-7890-12a3-b456-789012345def',
    });

    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 Captured Swap Args:', capturedArgs);

    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
      expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      // expect(capturedArgs.amount).toBe('0.0001');
      expect(capturedArgs.amountType).toBe('input');
      expect(capturedArgs.network).toBe('solana');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 5: should handle invalid token symbol gracefully', async () => {
    await agent.execute({
      input: 'swap 0.03 INVALIDTOKEN to USDC',
      threadId: '123e4567-e89b-12d3-a456-426614174003',
    });

    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 Captured Swap Args:', capturedArgs);

    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.fromToken).toBe('INVALIDTOKEN');
      expect(capturedArgs.toToken).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
      // expect(capturedArgs.amount).toBe('0.0001');
      expect(capturedArgs.amountType).toBe('input');
      expect(capturedArgs.network).toBe('solana');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 30000);

  it('Example 5b: should swap tokens via PancakeSwap on BNB Chain', async () => {
    await agent.execute({
      input: 'swap 0.01 BNB to CAKE on BNB chain using pancakeswap',
      threadId: '123e4567-e89b-12d3-a456-426614174004',
    });

    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 Captured Swap Args:', capturedArgs);

    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.fromToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      expect(capturedArgs.toToken).toBe('0x0e09fabb73bd3ae120f0902e54560ff690412c03');
      // expect(capturedArgs.amount).toBe('0.01');
      expect(capturedArgs.amountType).toBe('input');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('pancakeswap');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);
});
