import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ethers } from 'ethers';
import { AlchemyProvider } from '../../../providers/alchemy/src/AlchemyProvider';
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
import { Connection } from '@solana/web3.js';
import { BnbProvider } from '@binkai/rpc-provider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SwapPlugin } from '../../swap/src/SwapPlugin';
import { TokenPlugin } from '../../token/src/TokenPlugin';
import { BirdeyeProvider } from '../../../providers/birdeye/src/BirdeyeProvider';
import { BridgePlugin } from '../../bridge/src/BridgePlugin';
import { WalletPlugin } from '../../wallet/src/WalletPlugin';
import { ThenaProvider } from '../../../providers/thena/src/ThenaProvider';
import { JupiterProvider } from '../../../providers/jupiter/src/JupiterProvider';
import { deBridgeProvider } from '../../../providers/deBridge/src/deBridgeProvider';
import { PancakeSwapProvider } from '../../../providers/pancakeswap/src/PancakeSwapProvider';
import { VenusProvider } from '../../../providers/venus/src/VenusProvider';
import { StakingPlugin } from '../src/StakingPlugin';

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
      if ('tokenA' in input && 'amountA' in input) {
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
    const alchemyProvider = new AlchemyProvider({
      apiKey: settings.get('ALCHEMY_API_KEY'),
    });

    const pancakeswap = new PancakeSwapProvider(provider, 56);
    const jupiter = new JupiterProvider(solanaProvider);
    const thena = new ThenaProvider(provider, 56);
    const debridge = new deBridgeProvider([provider, solanaProvider]);

    // Initialize plugins with providers
    await walletPlugin.initialize({
      providers: [bnbProvider, birdeye, alchemyProvider],
      supportedChains: ['solana', 'bnb', 'ethereum'],
    });

    await tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [alchemyProvider, birdeye],
      supportedChains: ['solana', 'bnb', 'ethereum'],
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

    const stakingPlugin = new StakingPlugin();
    const venus = new VenusProvider(provider, 56);

    await stakingPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'bnb',
      providers: [venus],
      supportedChains: ['bnb', 'ethereum'],
    });

    // Register plugins with agent
    await agent.registerPlugin(swapPlugin);
    await agent.registerPlugin(walletPlugin);
    await agent.registerPlugin(tokenPlugin);
    await agent.registerPlugin(bridgePlugin);
    await agent.registerPlugin(stakingPlugin);
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

  // === STAKING ===

  it('Example 1: should handle stake request', async () => {
    await agent.execute({
      input: 'unstake 0.0012 BNB on Venus',
      threadId: '123e4567-e89b-12d3-a456-426614174007',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 1 Captured Stake Args:', capturedArgs);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.tokenA).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      expect(capturedArgs.amountA).toBe('0.0012');
      expect(capturedArgs.type).toBe('supply');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('venus');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 2: should handle stake BNB request', async () => {
    await agent.execute({
      input: 'unstake 0.0013 BNB on Venus',
      threadId: '123e4567-e89b-12d3-a456-426614174008',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 2 Captured Stake BNB Args:', capturedArgs);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.tokenA).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      expect(capturedArgs.amountA).toBe('0.0013');
      expect(capturedArgs.type).toBe('supply');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('venus');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 3: should handle unstake BNB request', async () => {
    await agent.execute({
      input: 'unstake all BNB from Venus',
      threadId: '123e4567-e89b-12d3-a456-426614174009',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 3 Captured Unstake BNB Args:', capturedArgs);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.tokenA).toBe('0xA07c5b74C9B40447a954e1466938b865b6BBea36');
      expect(capturedArgs.type).toBe('withdraw');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('venus');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);
});
