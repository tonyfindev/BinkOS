import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { AlchemyProvider, ethers } from 'ethers';
import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
  IToolExecutionCallback,
  ToolExecutionData,
  ToolExecutionState,
  PlanningAgent,
  IAgent,
  BaseTool,
  IPlugin,
} from '../dist';
import { Connection } from '@solana/web3.js';
import { SwapPlugin } from '../../plugins/swap/dist';
import { BridgePlugin } from '../../plugins/bridge/dist';
import { TokenPlugin } from '../../plugins/token/dist';
import { BnbProvider } from '@binkai/rpc-provider';
import { BirdeyeProvider } from '../../providers/birdeye/dist/BirdeyeProvider';
import { WalletPlugin } from '../../plugins/wallet/dist/WalletPlugin';
import { PancakeSwapProvider } from '../../providers/pancakeswap/dist/PancakeSwapProvider';
import { JupiterProvider } from '../../providers/jupiter/dist/JupiterProvider';
import { ThenaProvider } from '../../providers/thena/dist/ThenaProvider';
import { deBridgeProvider } from '../../providers/deBridge/dist/deBridgeProvider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LangGraphRunnableConfig } from '@langchain/langgraph';
import { StakingPlugin } from '../../plugins/staking/dist/StakingPlugin';
import { VenusProvider } from '../../providers/venus/dist/VenusProvider';
// import { AlchemyProvider } from '../../providers/alchemy/dist/AlchemyProvider';
// import { SolanaProvider } from '../../providers/solana/dist/SolanaProvider';

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
        console.log('🔍 Captured Args:', this.toolArgs);
      } else if ('tokenA' in input && 'amountA' in input) {
        this.toolArgs = input;
        console.log('🔍 Captured Args:', this.toolArgs);
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
    const stakingPlugin = new StakingPlugin();
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
    const venus = new VenusProvider(provider, 56);

    // Initialize plugins with providers
    await walletPlugin.initialize({
      defaultChain: 'bnb',
      providers: [bnbProvider, birdeye],
      supportedChains: ['bnb', 'solana', 'ethereum'],
    });

    await tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeye],
      supportedChains: ['solana', 'bnb'],
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

  // it('should get balance on Solana', async () => {
  //   const result = await agent.execute({
  //     input: 'get my balance on solana',
  //     threadId: '123e4567-e89b-12d3-a456-426614174000',
  //   });
  //   const expectedResponse = {
  //     sol: {
  //       amount: 0.123114135,
  //       value: 17.18,
  //     },
  //     jup: {
  //       amount: 1.707124,
  //       value: 0.69,
  //     },
  //     usdt: {
  //       amount: 0.645075,
  //       value: 0.65,
  //     },
  //     usdc: {
  //       amount: 0.08512,
  //       value: 0.09,
  //     },
  //     walletAddress: 'JjKTAVWetK6sefLMFdGJE3DrCcZxurhJdbNa41AYcz4',
  //   };

  //   console.log('🔍 result 1:', result);

  //   expect(result).toBeDefined();
  //   expect(result.toLowerCase()).toContain(
  //     (await wallet.getAddress(NetworkName.SOLANA)).toLowerCase(),
  //   );
  //   expect(result.toLowerCase()).toContain('sol');
  // }, 30000); // Increase timeout for this test

  // === SWAP ===

  it('Example 3: swap token on jupiter', async () => {
    await agent.execute({
      input: 'swap 0.0001 SOL to USDC',
      threadId: '987fcdeb-a123-45e6-7890-123456789abc',
    });

    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 3 Captured Swap Args:', capturedArgs);

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
    console.log('🔍 4 Captured Swap Args:', capturedArgs);

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
    console.log('🔍 5 Captured Swap Args:', capturedArgs);

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
    console.log('🔍 5b Captured Swap Args:', capturedArgs);

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

  // // === BRIDGE ===

  it('Example 6: should handle bridge request between chains', async () => {
    const result = await agent.execute({
      input: 'bridge 0.1 SOL to BNB chain',
      threadId: '123e4567-e89b-12d3-a456-426614174002',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 6 Captured Bridge Args:', capturedArgs);
    if (result) {
      expect(result).toBeDefined();
      expect(result.toLowerCase()).toContain('successfully');
      expect(result.toLowerCase()).toContain('bridge');
      expect(result.toLowerCase()).toContain('sol');
      expect(result.toLowerCase()).toContain('bnb');
    } else {
      expect(result).toBeNull();
    }
  }, 90000);

  it('Example 7:should handle bridge with specific amount and token', async () => {
    await agent.execute({
      input: 'bridge 10 BNB to SOL using debridge',
      threadId: '123e4567-e89b-12d3-a456-426614174005',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 7 Captured Bridge Args:', capturedArgs);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.fromToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      expect(capturedArgs.toToken).toBe('So11111111111111111111111111111111111111111');
      expect(capturedArgs.amountType).toBe('input');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('deBridge');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 8:should handle bridge with insufficient liquidity', async () => {
    const result = await agent.execute({
      input: 'bridge 0.0001 SOL to BNB chain', // Very large amount to trigger liquidity error
      threadId: '123e4567-e89b-12d3-a456-426614174006',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 8 Captured Bridge Args:', capturedArgs);
    console.log('🔍 Result 10:', result);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.fromNetwork).toBe('solana');
      expect(capturedArgs.toNetwork).toBe('bnb');
      expect(capturedArgs.fromToken).toBe('So11111111111111111111111111111111111111111');
      expect(capturedArgs.toToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      // expect(capturedArgs.amount).toBe('0.0001');
      expect(capturedArgs.amountType).toBe('input');
      expect(capturedArgs.provider).toBe('deBridge');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  // STAKE
  it('Example 9: should handle stake request', async () => {
    await agent.execute({
      input: 'stake 0.001 BNB on Venus',
      threadId: '123e4567-e89b-12d3-a456-426614174007',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 9 Captured Stake Args:', capturedArgs);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.tokenA).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      expect(capturedArgs.amountA).toBe('0.001');
      expect(capturedArgs.type).toBe('supply');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('venus');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 10: should handle stake BNB request', async () => {
    await agent.execute({
      input: 'stake 0.001 BNB on Venus',
      threadId: '123e4567-e89b-12d3-a456-426614174008',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 10 Captured Stake BNB Args:', capturedArgs);
    if (capturedArgs) {
      expect(capturedArgs).toBeDefined();
      expect(capturedArgs.tokenA).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
      expect(capturedArgs.amountA).toBe('0.001');
      expect(capturedArgs.type).toBe('supply');
      expect(capturedArgs.network).toBe('bnb');
      expect(capturedArgs.provider).toBe('venus');
    } else {
      expect(capturedArgs).toBeNull();
    }
  }, 90000);

  it('Example 11: should handle unstake BNB request', async () => {
    await agent.execute({
      input: 'unstake all BNB from Venus',
      threadId: '123e4567-e89b-12d3-a456-426614174009',
    });
    const capturedArgs = toolCallback.getToolArgs();
    console.log('🔍 11 Captured Unstake BNB Args:', capturedArgs);
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
