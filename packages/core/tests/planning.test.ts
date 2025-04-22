import { AIMessage, HumanMessage } from '@langchain/core/messages';
import { ethers } from 'ethers';
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

describe('Planning Agent', () => {
  let agent: PlanningAgent;
  let wallet: Wallet;
  let network: Network;
  let networks: NetworksConfig['networks'];

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

    // Register the tool execution callback
    agent.registerToolExecutionCallback(new ExampleToolExecutionCallback());

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

  it('should get balance on Solana', async () => {
    const result = await agent.execute({
      input: 'get my balance on solana',
      threadId: '123e4567-e89b-12d3-a456-426614174000',
    });
    const expectedResponse = {
      sol: {
        amount: 0.123114135,
        value: 17.18,
      },
      jup: {
        amount: 1.707124,
        value: 0.69,
      },
      usdt: {
        amount: 0.645075,
        value: 0.65,
      },
      usdc: {
        amount: 0.08512,
        value: 0.09,
      },
      walletAddress: 'JjKTAVWetK6sefLMFdGJE3DrCcZxurhJdbNa41AYcz4',
    };

    console.log('🔍 result 1:', result);

    expect(result).toBeDefined();
    expect(result.toLowerCase()).toContain(
      (await wallet.getAddress(NetworkName.SOLANA)).toLowerCase(),
    );
    expect(result.toLowerCase()).toContain('sol');
  }, 30000); // Increase timeout for this test

  it('Example 3: swap token on jupiter', async () => {
    const result = await agent.execute({
      input: 'swap 0.01 SOL to USDC',
      threadId: '987fcdeb-a123-45e6-7890-123456789abc',
    });

    expect(result).toBeDefined();
    console.log('🔍 Result 3:', result);
    expect(result.toLowerCase()).toContain('successfully');
    expect(result.toLowerCase()).toContain('swap');
    expect(result.toLowerCase()).toContain('sol');
    expect(result.toLowerCase()).toContain('usdc');
    expect(result.toLowerCase()).toContain('0.01');

    if (result && typeof result === 'object' && 'data' in result) {
      console.log('go to here:');
      expect(result.data).toBeDefined();
      expect(result.data.transactionHash).toBeDefined();
      expect(result.data.amount).toBe(0.01);
      expect(result.data.from).toBeDefined();
      expect(result.data.to).toBeDefined();
      expect(result.data.network).toBeDefined();
      expect(result.data.provider).toBeDefined();
    }
  }, 90000);
});
