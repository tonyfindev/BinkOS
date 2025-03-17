import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
} from '@binkai/core';
import { TokenPlugin } from '@binkai/token-plugin';
import { ethers } from 'ethers';
import { FourMemeProvider } from '@binkai/four-meme-provider';
import { BirdeyeProvider } from '@binkai/birdeye-provider';

// Hardcoded RPC URLs for demonstration
const SOLANA_RPC = 'https://api.mainnet-beta.solana.com';
const BNB_RPC = 'https://bsc-dataseed1.binance.org';

async function main() {
  console.log('🚀 Starting BinkOS token info example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  if (!settings.has('BIRDEYE_API_KEY')) {
    console.error('❌ Error: Please set BIRDEYE_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 API keys found\n');

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
    solana: {
      type: 'solana' as NetworkType,
      config: {
        rpcUrl: SOLANA_RPC,
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
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

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

  console.log('🤖 Wallet Solana:', await wallet.getAddress(NetworkName.SOLANA));
  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent(
    {
      model: 'gpt-4',
      temperature: 0,
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Create and configure the token plugin
  console.log('🔍 Initializing token plugin...');
  const tokenPlugin = new TokenPlugin();

  const provider = new ethers.JsonRpcProvider(BNB_RPC);

  const fourMeme = new FourMemeProvider(provider, 56);
  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });
  // Configure the plugin with supported chains
  await tokenPlugin.initialize({
    defaultChain: 'bnb',
    providers: [birdeye, fourMeme as any],
    supportedChains: ['bnb'],
  });
  console.log('✓ Token plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering token plugin with agent...');
  await agent.registerPlugin(tokenPlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Create a token on BSC
  console.log('💎 Example 1: Create a token on BSC');
  const result = await agent.execute({
    input:
      'Create a new token on BNB chain with name: "TST", symbol: "TST", description: "This is a TST Test token"',
  });
  console.log('✓ Token created:', result, '\n');
  // Get plugin information
  const registeredPlugin = agent.getPlugin('token') as TokenPlugin;

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
