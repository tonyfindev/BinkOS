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

    // Initialize a new wallet
    wallet = new Wallet(
      {
        seedPhrase:
          settings.get('WALLET_MNEMONIC') ||
          'test test test test test test test test test test test junk',
        index: 0,
      },
      network,
    );

    // Create an agent with OpenAI
    agent = new PlanningAgent(
      {
        model: 'gpt-4o',
        temperature: 0,
        systemPrompt:
          'You are a BINK AI agent. You are able to perform swaps, bridges and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a bridge or swap.',
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
    const solanaProvider = new Connection(SOL_RPC);
    const pancakeswap = new PancakeSwapProvider(provider, 56);
    const jupiter = new JupiterProvider(solanaProvider);
    const thena = new ThenaProvider(provider, 56);
    const debridge = new deBridgeProvider([provider, solanaProvider]);

    // Initialize plugins with providers
    await walletPlugin.initialize({
      defaultChain: 'bnb',
      providers: [bnbProvider, birdeye],
      supportedChains: ['bnb'],
    });

    await tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeye],
      supportedChains: ['solana', 'bnb'],
    });

    await swapPlugin.initialize({
      providers: [pancakeswap, jupiter, thena],
      supportedChains: ['bnb', 'ethereum', 'solana'],
    });

    await bridgePlugin.initialize({
      defaultChain: 'bnb',
      providers: [debridge],
      supportedChains: ['bnb', 'solana'],
    });

    // Register plugins with agent
    await agent.registerPlugin(swapPlugin as unknown as IPlugin);
    await agent.registerPlugin(walletPlugin as unknown as IPlugin);
    await agent.registerPlugin(tokenPlugin as unknown as IPlugin);
    await agent.registerPlugin(bridgePlugin as unknown as IPlugin);
  }, 30000); // Increase timeout for beforeEach

  it('should get balance on Solana', async () => {
    const result = await agent.execute({
      input: 'get my balance on solana',
      threadId: '123e4567-e89b-12d3-a456-426614174000',
    });
    console.log('🚀 ~ it ~ result 1:', result);

    expect(result).toBeDefined();
  }, 30000); // Increase timeout for this test

  it('should handle chat history', async () => {
    const chatHistory = [
      new HumanMessage('Buy BINK'),
      new AIMessage('Please provide the amount of BNB you want to spend'),
    ];

    const result = await agent.execute({
      input: '0.0001 BNB with 0.5% slippage on bnb chain.',
      history: chatHistory,
      threadId: '987fcdeb-a123-45e6-7890-123456789abc',
    });
    console.log('🔍 Result 2:', result);

    expect(result).toBeDefined();
  }, 50000); // Increase timeout for this test
});
