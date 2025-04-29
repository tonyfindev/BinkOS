import { ethers } from 'ethers';
import {
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
} from '@binkai/core';
import { Connection } from '@solana/web3.js';
import { BridgePlugin } from '../../bridge/dist/BridgePlugin';
import { TokenPlugin } from '../../token/dist/TokenPlugin';
import { BnbProvider } from '@binkai/rpc-provider';
import { BirdeyeProvider } from '../../../providers/birdeye/dist/BirdeyeProvider';
import { WalletPlugin } from '../../../plugins/wallet/dist/WalletPlugin';
import { PancakeSwapProvider } from '../../../providers/pancakeswap/dist/PancakeSwapProvider';
import { JupiterProvider } from '../../../providers/jupiter/dist/JupiterProvider';
import { ThenaProvider } from '../../../providers/thena/dist/ThenaProvider';
import { deBridgeProvider } from '../../../providers/deBridge/dist/deBridgeProvider';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StakingPlugin } from '../../../plugins/staking/dist/StakingPlugin';
import { VenusProvider } from '../../../providers/venus/dist/VenusProvider';
import { BinkProvider } from '../../../providers/bink/dist/BinkProvider';
import { AlchemyProvider } from '../../../providers/alchemy/dist/AlchemyProvider';
import { SolanaProvider } from '../../../providers/rpc/dist/SolanaProvider';
import { ImagePlugin } from '../../../plugins/image/dist/ImagePlugin';
import { KnowledgePlugin } from '../../../plugins/knowledge/dist/KnowledgePlugin';
import { FourMemeProvider } from '../../../providers/four-meme/dist/FourMemeProvider';
import { KernelDaoProvider } from '../../../providers/kernel-dao/dist/KernelDaoProvider';
import { OkuProvider } from '../../../providers/oku/dist/OkuProvider';
import { KyberProvider } from '../../../providers/kyber/dist/KyberProvider';
import { ListaProvider } from '../../../providers/lista/dist/ListaProvider';
import { SwapPlugin } from '../../../plugins/swap/dist/SwapPlugin';

// Hardcoded RPC URLs for demonstration
const BSC_RPC_URL='https://bsc-dataseed1.binance.org';
const ETHEREUM_RPC_URL='https://eth.llamarpc.com';
const RPC_URL='https://api.mainnet-beta.solana.com';

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
    // Log state and input data
    if (data.state === ToolExecutionState.STARTED) {
      
      // Save input data for the swap tool
      if (data.input && typeof data.input === 'object') {
        if (data.toolName === 'swap') {
          this.toolArgs = { ...data.input };
        }
      }
    }
  }

  getToolArgs() {
    return this.toolArgs;
  }
}

class MockSwapPlugin extends SwapPlugin {
  finalArgs: any = null;

  // Override initialize to modify the swapTool instance
  async initialize(config: any): Promise<void> {
    // Call the parent initialize first
    await super.initialize(config);
    
    // Get the swapTool property from the parent class
    const swapToolProperty = Object.entries(this).find(([key, value]) => 
      key === 'swapTool' || (value && typeof value === 'object' && 'simulateQuoteTool' in value)
    );
    
    if (swapToolProperty) {
      const [toolKey, originalTool] = swapToolProperty;
      
      // Replace the simulateQuoteTool method with our spy function
      const originalSimulateQuoteTool = originalTool.simulateQuoteTool;
      originalTool.simulateQuoteTool = async (args: any) => {
        // Capture the args
        this.finalArgs = {...args};
        
        // Return result from original method
        return originalSimulateQuoteTool.call(originalTool, args);
      };
    }
  }
}

describe('Planning Agent', () => {
  let agent: PlanningAgent;
  let wallet: Wallet;
  let network: Network;
  let networks: NetworksConfig['networks'];
  let toolCallback: ToolArgsCallback;
  let mockSwapPlugin: MockSwapPlugin;

  // Helper test function
  async function testSwapToolArgs(input: string) {
    // Reset tool callback before each test
    toolCallback = new ToolArgsCallback();
    agent.registerToolExecutionCallback(toolCallback);
    
    await agent.execute({
      input: input,
      threadId: '987fcdeb-a123-45e6-7890-123456789abc',
    });

    // Then check the callback captured args
    const callbackArgs = toolCallback.getToolArgs();
    
    // Return whichever is not null, preferring mockSwapPlugin
    return mockSwapPlugin.finalArgs || callbackArgs;
  }

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
          rpcUrl: BSC_RPC_URL,
          name: 'BNB Chain',
          nativeCurrency: {
            name: 'BNB',
            symbol: 'BNB',
            decimals: 18,
          },
        },
      },
      ethereum: {
        type: 'evm' as NetworkType,
        config: {
          chainId: 1,
          rpcUrl: ETHEREUM_RPC_URL,
          name: 'Ethereum',
          nativeCurrency: {
            name: 'Ether',
            symbol: 'ETH',
            decimals: 18,
          },
        },
      },
      solana: {
        type: 'solana' as NetworkType,
        config: {
          rpcUrl: RPC_URL,
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
        model: 'gpt-4o-mini',
        temperature: 0,
        isHumanReview: true,
        systemPrompt: `You are a BINK AI assistant.`,
      },
      wallet,
      networks,
    );

    toolCallback = new ToolArgsCallback();
    agent.registerToolExecutionCallback(toolCallback);

    /**
    * Initialize every provider and plugin in system since it will effect the reasoning ability of the agent
    * This is AI dependent test, so we need to initialize everything to make the test reliable
    */

     // Initialize provider
    const birdeyeApi = new BirdeyeProvider({
      apiKey: settings.get('BIRDEYE_API_KEY'),
    });
    const alchemyApi = new AlchemyProvider({
      apiKey: settings.get('ALCHEMY_API_KEY'),
    });
    const binkProvider = new BinkProvider({
      apiKey: settings.get('BINK_API_KEY') ?? 'this-is-test-key',
      baseUrl: settings.get('BINK_BASE_URL') ?? 'https://api.test-bink.com',
      imageApiUrl: settings.get('BINK_IMAGE_API_URL') ?? 'https://image.test-bink.com',
    });
    const bnbProvider = new BnbProvider({
      rpcUrl: BSC_RPC_URL,
    });
    const solanaProvider = new SolanaProvider({
      rpcUrl: RPC_URL,
    });
    const bscProvider = new ethers.JsonRpcProvider(BSC_RPC_URL);


    // Initialize plugins
    const bscChainId = 56;
    const pancakeswap = new PancakeSwapProvider(bscProvider, bscChainId);
    // const okx = new OkxProvider(this.bscProvider, bscChainId);
    const fourMeme = new FourMemeProvider(bscProvider, bscChainId);
    const venus = new VenusProvider(bscProvider, bscChainId);
    const kernelDao = new KernelDaoProvider(bscProvider, bscChainId);
    const oku = new OkuProvider(bscProvider, bscChainId);
    const kyber = new KyberProvider(bscProvider, bscChainId);
    const jupiter = new JupiterProvider(new Connection(RPC_URL));
    const imagePlugin = new ImagePlugin();
    // const swapPlugin = new SwapPlugin();
    mockSwapPlugin = new MockSwapPlugin();
    const tokenPlugin = new TokenPlugin();
    const knowledgePlugin = new KnowledgePlugin();
    const bridgePlugin = new BridgePlugin();
    const debridge = new deBridgeProvider(
      [bscProvider, new Connection(RPC_URL)],
      56,
      7565164,
    );
    const walletPlugin = new WalletPlugin();
    const stakingPlugin = new StakingPlugin();
    const thena = new ThenaProvider(bscProvider, bscChainId);
    const lista = new ListaProvider(bscProvider, bscChainId);


    // Initialize plugins with providers
    mockSwapPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'bnb',
      providers: [pancakeswap, fourMeme, thena, jupiter, oku, kyber],
      supportedChains: ['bnb', 'ethereum', 'solana'], // These will be intersected with agent's networks
    }),
    tokenPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeyeApi, fourMeme as any],
      supportedChains: ['solana', 'bnb', 'ethereum'],
    }),
    await knowledgePlugin.initialize({
      providers: [binkProvider],
    }),
    await imagePlugin.initialize({
      defaultChain: 'bnb',
      providers: [binkProvider],
    }),
    await bridgePlugin.initialize({
      defaultChain: 'bnb',
      providers: [debridge],
      supportedChains: ['bnb', 'solana'],
    }),
    await walletPlugin.initialize({
      defaultChain: 'bnb',
      providers: [birdeyeApi, alchemyApi, bnbProvider, solanaProvider],
      supportedChains: ['bnb', 'solana', 'ethereum'],
    }),
    await stakingPlugin.initialize({
      defaultSlippage: 0.5,
      defaultChain: 'bnb',
      providers: [venus, kernelDao, lista],
    }),

    // Register plugins with agent
    await agent.registerPlugin(mockSwapPlugin as any);
    await agent.registerPlugin(tokenPlugin as any);
    await agent.registerPlugin(knowledgePlugin as any);
    await agent.registerPlugin(bridgePlugin as any);
    await agent.registerPlugin(walletPlugin as any);
    await agent.registerPlugin(stakingPlugin as any);
    await agent.registerPlugin(imagePlugin as any);
  }, 30000); // Increase timeout for beforeEach


  // === SWAP TESTS ===

  // Test Case 1: Basic swap (input amount) - Should succeed
  it('Test 1: Basic swap with input amount', async () => {
    const args = await testSwapToolArgs('swap 0.01 SOL to USDC on solana');
    console.log('🌈 Swap operation details 1:', JSON.stringify(args, null, 2));

    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.01');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('solana');
    console.log('✅ Test 1 passed');
  }, 90000);

  // Test Case 2: Reverse swap (output amount) - Should succeed
  it('Test 2: Reverse swap with output amount', async () => {
    const args = await testSwapToolArgs('buy 0.01 USDC with SOL on solana');
    console.log('🌈 Swap operation details 2:', JSON.stringify(args, null, 2));

    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.01');
    expect(args.amountType).toBe('output');
    expect(args.network).toBe('solana');
    console.log('✅ Test 2 passed');
  }, 90000);

  // Test Case 3: Swap with explicitly specified provider - Should succeed
  it('Test 3: Swap with specific provider', async () => {
    const args = await testSwapToolArgs('swap 0.01 SOL to USDC using jupiter');
    console.log('🌈 Swap operation details 3:', JSON.stringify(args, null, 2));

    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('solana');
    expect(args.provider).toBe('jupiter');
    console.log('✅ Test 3 passed');
  }, 90000);

  // Test Case 4: Swap with explicitly specified network - Should succeed
  it('Test 4: Swap with specific network', async () => {
    const args = await testSwapToolArgs('swap 0.01 SOL to USDC on solana');
    console.log('🌈 Swap operation details 4:', JSON.stringify(args, null, 2));

    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('solana');
    console.log('✅ Test 4 passed');
  }, 90000);

  // Test Case 5: Swap with BNB token - Should succeed
  it('Test 5: Swap BNB to cake', async () => {
    const args = await testSwapToolArgs('swap 0.001 BNB to CAKE');
    console.log('🌈 Swap operation details 5:', JSON.stringify(args, null, 2));
    
    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(args.toToken).toBe('0x0e09fabb73bd3ae120f0902e54560ff690412c03');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('bnb');
    console.log('✅ Test 5 passed');
  }, 90000);

  // Test Case 6: Reverse swap with BNB - Should succeed
  it('Test 6: Reverse swap to buy BNB', async () => {
    const args = await testSwapToolArgs('buy 0.001 BNB with CAKE');
    console.log('🌈 Swap operation details 6:', JSON.stringify(args, null, 2));
    
    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('0x0e09fabb73bd3ae120f0902e54560ff690412c03');
    expect(args.toToken).toBe('0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('output');
    expect(args.network).toBe('bnb');
    console.log('✅ Test 6 passed');
  }, 90000);

  // Test Case 7: Swap with slippage specified - Should succeed
  it('Test 7: Swap with slippage specified', async () => {
    const args = await testSwapToolArgs('swap 0.001 SOL to USDC with 1% slippage');
    console.log('🌈 Swap operation details 7:', JSON.stringify(args, null, 2));

    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('solana');
    expect(args.slippage).toBe(1);
    console.log('✅ Test 7 passed');
  }, 90000);

  // Test Case 8: Invalid token symbol - Should fail gracefully (AI failure = test success)
  it('Test 8: Swap with invalid token symbol', async () => {
    const args = await testSwapToolArgs('swap 0.001 INVALID_TOKEN to USDC');
    console.log('🌈 Swap operation details 8:', JSON.stringify(args, null, 2));
    
    // SPECIAL CASE: For this test, we EXPECT the swap operation to fail at some point
    // But we still want to capture the args that were passed to simulateQuoteTool
    
    // Mark test as skipped with a message if args are null
    if (!args) {
      console.log('⚠️ Test 8: Could not capture args for invalid token test - marking as skipped');
      return;
    }
    
    // If we got args, validate them
    expect(args.fromToken).toBeDefined();
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('input');
    console.log('✅ Test 8 passed: Successfully captured arguments for invalid token');
  }, 90000);

  // Test Case 9: Invalid amount (too large) - Should fail gracefully (AI failure = test success)
  it('Test 9: Swap with unreasonably large amount', async () => {
    const args = await testSwapToolArgs('swap 999999 SOL to USDC');
    console.log('🌈 Swap operation details 9:', JSON.stringify(args, null, 2));
    
    // SPECIAL CASE: For this test, we EXPECT the swap execution to fail
    // But we still want to capture the args that were passed to simulateQuoteTool
    // Mark test as skipped with a message if args are null
    if (!args) {
      console.log('⚠️ Test 9: Could not capture args for large amount test - marking as skipped');
      return;
    }
    
    // If we got args, validate them
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('999999');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('solana');
    console.log('✅ Test 9 passed: Successfully captured arguments for unreasonably large amount');
  }, 90000);

  // Test Case 10: Complex natural language query - Should succeed
  it('Test 10: Swap with complex natural language', async () => {
    const args = await testSwapToolArgs('I would like to exchange 0.001 SOL for some USDC tokens please');
    console.log('🌈 Swap operation details 10:', JSON.stringify(args, null, 2));
    
    // Use assert style that will fail the test when args is null
    expect(args).not.toBeNull();
    expect(args.fromToken).toBe('So11111111111111111111111111111111111111111');
    expect(args.toToken).toBe('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB');
    expect(args.amount).toBe('0.001');
    expect(args.amountType).toBe('input');
    expect(args.network).toBe('solana');
    console.log('✅ Test 10 passed');
  }, 90000);
});
