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

async function main() {
  console.log('🚀 Starting BinkOS swap example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found\n');

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
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
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize provider
  console.log('🔌 Initializing provider...');
  const provider = new ethers.JsonRpcProvider(BNB_RPC);
  console.log('✓ Provider initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet(
    {
      seedPhrase:
        settings.get('WALLET_MNEMONIC') ||
        'test test test test test test test test test test test junk',
      index: 0,
    },
    network,
  );
  console.log('✓ Wallet created\n');

  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));
  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new PlanningAgent(
    {
      model: 'gpt-4o',
      temperature: 0,
      systemPrompt:
        'You are a BINK AI agent. You are able to perform swaps, bridges and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a bridge or swap.',
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  const solanaProvider = new Connection(SOL_RPC);

  // Register the tool execution callback
  console.log('🔔 Registering tool execution callback...');
  agent.registerToolExecutionCallback(new ExampleToolExecutionCallback());
  console.log('✓ Callback registered\n');

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();

  console.log('🔄 Initializing bridge plugin...');
  const bridgePlugin = new BridgePlugin();

  console.log('🔍 Initializing token plugin...');
  const tokenPlugin = new TokenPlugin();

  // Create Birdeye provider with API key
  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  // Create and configure the wallet plugin
  console.log('🔄 Initializing wallet plugin...');
  const walletPlugin = new WalletPlugin();
  // Create provider with API key
  const bnbProvider = new BnbProvider({
    rpcUrl: BNB_RPC,
  });

  // Initialize plugin with provider
  await walletPlugin.initialize({
    defaultChain: 'bnb',
    providers: [bnbProvider, birdeye],
    supportedChains: ['bnb'],
  });
  // Configure the plugin with supported chains
  await tokenPlugin.initialize({
    defaultChain: 'bnb',
    providers: [birdeye],
    supportedChains: ['solana', 'bnb'],
  });
  console.log('✓ Token plugin initialized\n');

  // Create providers with proper chain IDs
  const pancakeswap = new PancakeSwapProvider(provider, 56);
  // Create providers with proper chain IDs
  const jupiter = new JupiterProvider(solanaProvider);

  const thena = new ThenaProvider(provider, 56);

  // const okx = new OkxProvider(provider, 56);

  // const fourMeme = new FourMemeProvider(provider, 56);

  // Configure the plugin with supported chains
  await swapPlugin.initialize({
    providers: [pancakeswap, jupiter, thena],
    supportedChains: ['bnb', 'ethereum', 'solana'], // These will be intersected with agent's networks
  });
  console.log('✓ Swap plugin initialized\n');

  // Create providers with proper chain IDs
  const debridge = new deBridgeProvider([provider, solanaProvider]);
  // Configure the plugin with supported chains
  await bridgePlugin.initialize({
    defaultChain: 'bnb',
    providers: [debridge],
    supportedChains: ['bnb', 'solana'], // These will be intersected with agent's networks
  });

  // Register the plugin with the agent
  console.log('🔌 Registering swap plugin with agent...');
  const typedSwapPlugin = swapPlugin as unknown as IPlugin;
  await agent.registerPlugin(typedSwapPlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering wallet plugin with agent...');
  const typedWalletPlugin = walletPlugin as unknown as IPlugin;
  await agent.registerPlugin(typedWalletPlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering token plugin with agent...');
  const typedTokenPlugin = tokenPlugin as unknown as IPlugin;
  await agent.registerPlugin(typedTokenPlugin);
  console.log('✓ Plugin registered\n');

  console.log('🔌 Registering bridge plugin with agent...');
  const typedBridgePlugin = bridgePlugin as unknown as IPlugin;
  await agent.registerPlugin(typedBridgePlugin);
  console.log('✓ Plugin registered\n');

  // const result = await agent.execute("My balance on BNB chain");

  const chatHistory = [
    new HumanMessage('Buy BINK'),
    new AIMessage('Please provide the amount of BNB you want to spend'),
  ];
  console.log('🚀 ~ main ~ chatHistory:', chatHistory);
  const result = await agent.execute(
    {
      // input: '0.0001 BNB with 0.5% slippage on bnb chain.',
      input: 'get my balance on solana',
      // history: chatHistory,
      threadId: '1d81e0fe-11b2-4073-b2c2-cc9e3615360a',
    },
    data => {
      // console.log(data, '|');
    },
  );
  console.log('✓ Result:', result, '\n');

  it('should create a new planning instance', async () => {
    const result = await agent.execute({
      input: 'get my balance on solana',
    });
    console.log('✓ Result:', result, '\n');
    expect(result).toBeDefined();
  });
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
