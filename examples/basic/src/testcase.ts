import { ethers } from 'ethers';
import {
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
  IToolExecutionCallback,
  ToolExecutionState,
  ToolExecutionData,
  PlanningAgent,
  Agent,
} from '@binkai/core';

// Import plugins
import { StakingPlugin } from '@binkai/staking-plugin';
import { SwapPlugin } from '@binkai/swap-plugin';
import { TokenPlugin } from '@binkai/token-plugin';
import { WalletPlugin } from '@binkai/wallet-plugin';

// Import providers
import { VenusProvider } from '@binkai/venus-provider';
import { BnbProvider, SolanaProvider } from '@binkai/rpc-provider';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { KyberProvider } from '@binkai/kyber-provider';
import { OkuProvider } from '@binkai/oku-provider';
import { ThenaProvider } from '@binkai/thena-provider';
import { KernelDaoProvider } from '@binkai/kernel-dao-provider';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { FourMemeProvider } from '@binkai/four-meme-provider';
import { Connection } from '@solana/web3.js';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://solana-rpc.debridge.finance';

class ExampleToolExecutionCallback implements IToolExecutionCallback {
  onToolExecution(data: ToolExecutionData): void {
    const stateEmoji = {
      [ToolExecutionState.STARTED]: '🚀',
      [ToolExecutionState.IN_PROCESS]: '⏳',
      [ToolExecutionState.COMPLETED]: '✅',
      [ToolExecutionState.FAILED]: '❌',
    };

    const emoji = stateEmoji[data.state] || '🔄';
    console.log(`${emoji} ${data.message}`);

    if (data.state === ToolExecutionState.FAILED && data.error) {
      console.error('❌ Error:', data.error.message || String(data.error));
    }
  }
}

async function runTestCase(testCase: {
  description: string;
  input: string;
  threadId: `${string}-${string}-${string}-${string}-${string}`;
}) {
  console.log(`\n📝 Test case: ${testCase.description}`);
  console.log(`Input: ${testCase.input}`);

  // Define available networks
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
    [NetworkName.ETHEREUM]: {
      type: 'evm' as NetworkType,
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
  const network = new Network({ networks });

  // Initialize providers
  const bscProvider = new ethers.JsonRpcProvider(BNB_RPC);
  const solanaConnection = new Connection(SOL_RPC);

  // Initialize a new wallet
  const wallet = new Wallet(
    {
      seedPhrase:
        settings.get('WALLET_MNEMONIC') ||
        'test test test test test test test test test test test junk',
      index: 0,
    },
    network,
  );

  // Initialize providers
  const bscChainId = 56;
  const pancakeswap = new PancakeSwapProvider(bscProvider, bscChainId);
  const fourMeme = new FourMemeProvider(bscProvider, bscChainId);
  const venus = new VenusProvider(bscProvider, bscChainId);
  const kernelDao = new KernelDaoProvider(bscProvider, bscChainId);
  const oku = new OkuProvider(bscProvider, bscChainId);
  const kyber = new KyberProvider(bscProvider, bscChainId);
  const jupiter = new JupiterProvider(solanaConnection);
  const thena = new ThenaProvider(bscProvider, bscChainId);

  // Initialize API providers
  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY') || '',
  });

  const bnbProvider = new BnbProvider({
    rpcUrl: BNB_RPC,
  });

  const solanaProvider = new SolanaProvider({
    rpcUrl: SOL_RPC,
  });

  // Initialize plugins
  const swapPlugin = new SwapPlugin();
  const tokenPlugin = new TokenPlugin();
  const walletPlugin = new WalletPlugin();
  const stakingPlugin = new StakingPlugin();

  // Initialize all plugins in parallel
  await Promise.all([
    swapPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'bnb',
      providers: [pancakeswap, fourMeme, thena, jupiter, oku, kyber],
      supportedChains: ['bnb', 'ethereum', 'solana'],
    }),
    tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeye, fourMeme as any],
      supportedChains: ['bnb', 'solana', 'ethereum'],
    }),
    walletPlugin.initialize({
      defaultChain: 'bnb',
      providers: [bnbProvider, birdeye, solanaProvider],
      supportedChains: ['bnb', 'solana', 'ethereum'],
    }),
    stakingPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'bnb',
      providers: [venus, kernelDao],
      supportedChains: ['bnb', 'ethereum'],
    }),
  ]);

  // Create PlanningAgent
  const agent = new PlanningAgent(
    {
      model: 'gpt-4o',
      temperature: 0,
      systemPrompt:
        'You are a BINK AI agent specialized in DeFi operations. Your task is to analyze user requests and execute appropriate DeFi operations including swapping, staking, transfers and limit orders.',
    },
    wallet,
    networks,
  );

  // Register callback
  agent.registerToolExecutionCallback(new ExampleToolExecutionCallback());

  // Initialize agent and register plugins
  await agent.initialize();
  await agent.registerPlugin(swapPlugin);
  await agent.registerPlugin(tokenPlugin);
  await agent.registerPlugin(walletPlugin);
  await agent.registerPlugin(stakingPlugin);

  try {
    const result = await agent.execute({
      input: testCase.input,
      threadId: testCase.threadId,
    });

    console.log('✓ Result:', result);
    console.log('-------------------');
  } catch (error: unknown) {
    if (error instanceof Error) {
      console.error(`❌ Error in test case "${testCase.description}":`, error.message);
    } else {
      console.error(`❌ Error in test case "${testCase.description}":`, String(error));
    }
    console.log('-------------------');
  }
}

async function main() {
  console.log('🚀 Starting BinkOS test cases...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found\n');

  // Test cases for all functionalities
  const testCases = [
    // Staking test cases
    {
      description: 'Stake BNB',
      input: 'stake 0.0001 BNB',
      threadId: '123e4567-e89b-12d3-a456-426614174003' as const,
    },
    // Swap test cases
    {
      description: 'Swap on Kyber',
      input: 'swap 0.0001 BNB to USDT via Kyber',
      threadId: '123e4567-e89b-12d3-a456-426614174004' as const,
    },
    {
      description: 'Swap on Oku',
      input: 'swap 0.0001 BNB to USDT via Oku',
      threadId: '123e4567-e89b-12d3-a456-426614174005' as const,
    },
    {
      description: 'Swap on OKX',
      input: 'swap 0.0001 BNB to USDT via OKX',
      threadId: '123e4567-e89b-12d3-a456-426614174006' as const,
    },
    {
      description: 'Swap on Thena',
      input: 'swap 0.0001 BNB to USDT via Thena',
      threadId: '123e4567-e89b-12d3-a456-426614174007' as const,
    },
    {
      description: 'Swap on PancakeSwap',
      input: 'swap 0.0001 BNB to USDT via PancakeSwap',
      threadId: '123e4567-e89b-12d3-a456-426614174008' as const,
    },

    // Transfer test cases (using WalletPlugin)
    {
      description: 'Transfer BNB',
      input: 'transfer 0.0001 BNB to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      threadId: '123e4567-e89b-12d3-a456-426614174009' as const,
    },
    {
      description: 'Transfer USDT',
      input: 'transfer 0.0001 USDT to 0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      threadId: '123e4567-e89b-12d3-a456-426614174010' as const,
    },

    // Limit Order test cases (using SwapPlugin)
    {
      description: 'Create Limit Order via Thena',
      input: 'swap 0.0001 BNB to USDC at price 700 via Thena',
      threadId: '123e4567-e89b-12d3-a456-426614174011' as const,
    },
  ];

  // Run test cases
  console.log('🧪 Running test cases...\n');

  for (const testCase of testCases) {
    await runTestCase(testCase);
  }

  console.log('\n✅ All tests completed');
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
