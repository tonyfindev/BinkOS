import { ethers } from 'ethers';
import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
} from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { OkxProvider } from '@binkai/okx-provider';
import { FourMemeProvider } from '@binkai/four-meme-provider';
import { ChainId } from '@pancakeswap/sdk';
import { PostgresDatabaseAdapter } from '@binkai/postgres-adapter';
import { ThenaProvider } from '@binkai/thena-provider';
import { OkuProvider } from '@binkai/oku-provider';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { Connection } from '@solana/web3.js';
import { TokenPlugin } from '@binkai/token-plugin';
import { BirdeyeProvider } from '@binkai/birdeye-provider';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

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
    bnb: {
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
    ethereum: {
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
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  const tokenPlugin = new TokenPlugin();
  await tokenPlugin.initialize({
    // defaultChain: 'solana',
    providers: [birdeye],
    supportedChains: ['solana', 'bnb', 'ethereum'],
  });
  console.log('✓ Token plugin initialized\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize provider
  console.log('🔌 Initializing provider...');
  const bnb_provider = new ethers.JsonRpcProvider(BNB_RPC);
  const sol_provider = new Connection(SOL_RPC);
  const eth_provider = new ethers.JsonRpcProvider(ETH_RPC);

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
  console.log('🤖 Wallet ETH:', await wallet.getAddress(NetworkName.ETHEREUM));
  console.log('🤖 Wallet SOL:', await wallet.getAddress(NetworkName.SOLANA));
  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent(
    {
      model: 'gpt-4o',
      temperature: 0,
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Initialize database
  // console.log('🗄️ Initializing database...');
  // let db: PostgresDatabaseAdapter | undefined;
  // if (settings.get('POSTGRES_URL')) {
  //   db = new PostgresDatabaseAdapter({
  //     connectionString: settings.get('POSTGRES_URL'),
  //   });
  //   await agent.registerDatabase(db);
  // }

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();

  // Create providers with proper chain IDs
  const okx = new OkxProvider(bnb_provider, 56);
  const jupiter = new JupiterProvider(sol_provider);
  const thena = new ThenaProvider(eth_provider, 1);
  // Configure the plugin with supported chains
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    defaultChain: 'bnb',
    providers: [okx, thena, jupiter],
    supportedChains: ['bnb', 'ethereum', 'solana'], // These will be intersected with agent's networks
  });
  console.log('✓ Swap plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering swap plugin with agent...');
  await agent.registerPlugin(swapPlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Buy with exact input amount on BNB Chain
  console.log('💱 Example 1: Buy with exact input amount all providers');
  const result1 = await agent.execute({
    input: `
      swap 0.001 WHALES MARKET to TRUMP
      Whales Market address: GTH3wG3NErjwcf7VGCoXEXkgXSHvYhx5gtATeeM5JAS1 
      trump address: 6p6xgHyF7AeE6TZkSmFsko444wqoP15icUSqi2jfGiPN    `,
  });
  console.log('✓ Swap result:', result1, '\n');

  // Example 2: Sell with exact output amount on BNB Chain
  // console.log('💱 Example 2: Sell with exact output amount on BNB Chain');
  // const result2 = await agent.execute({
  //   input: `
  //     Sell 100 BINK to BNB by Oku.
  //     Use the following token addresses:
  //      BINK: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
  //   `,
  // });

  // console.log('✓ Swap result:', result2, '\n');

  // Get plugin information
  const registeredPlugin = agent.getPlugin('swap') as SwapPlugin;

  // Check available providers for each chain
  console.log('📊 Available providers by chain:');
  const chains = registeredPlugin.getSupportedNetworks();
  for (const chain of chains) {
    const providers = registeredPlugin.getProvidersForNetwork(chain);
    console.log(`Chain ${chain}:`, providers.map(p => p.getName()).join(', '));
  }
  console.log();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
