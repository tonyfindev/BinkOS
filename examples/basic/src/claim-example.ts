import {
  Agent,
  Wallet,
  Network,
  settings,
  NetworkType,
  NetworksConfig,
  NetworkName,
} from '@binkai/core';
import { ClaimPlugin, BaseClaimProvider } from '@binkai/claim-plugin';
import { ListaProvider } from '@binkai/lista-provider';
import { ethers } from 'ethers';

// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';

async function main() {
  console.log('🚀 Starting BinkOS claim example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 API keys found\n');

  // Define available networks
  console.log('📡 Configuring networks...');
  const networkConfigs: NetworksConfig['networks'] = {
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
  console.log('✓ Networks configured:', Object.keys(networkConfigs).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks: networkConfigs });
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

  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent(
    {
      model: 'gpt-4o',
      temperature: 0,
    },
    wallet,
    networkConfigs,
  );
  console.log('✓ Agent initialized\n');

  // Create and configure the claim plugin
  console.log('🔍 Initializing claim plugin...');
  const claimPlugin = new ClaimPlugin();

  // Create BNB provider
  const provider = new ethers.JsonRpcProvider(BNB_RPC);

  // Create Lista claim provider
  const listaProvider = new ListaProvider(provider);

  // Initialize plugin with provider
  await claimPlugin.initialize({
    defaultNetwork: 'bnb',
    providers: [listaProvider as unknown as BaseClaimProvider],
    supportedNetworks: ['bnb'],
  });
  console.log('✓ Claim plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering claim plugin with agent...');
  await agent.registerPlugin(claimPlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Get claimable balances
  console.log('💎 Example 1: Get claimable balances');
  const claimableBalances = await agent.execute({
    input: 'Check claim in my wallet on BNB chain',
  });
  console.log('✓ Claimable balances:', claimableBalances, '\n');

  //   // Example 2: Claim a specific token
  //   console.log('💎 Example 2: Claim a specific token');
  //   const claimResult = await agent.execute({
  //     input: 'Claim my BNB tokens from Lista protocol',
  //   });
  //   console.log('✓ Claim result:', claimResult, '\n');

  // Get plugin information
  const registeredPlugin = agent.getPlugin('claim') as ClaimPlugin;

  // Check available providers for each network
  console.log('📊 Available providers by network:');
  const supportedNetworks = registeredPlugin.getSupportedNetworks();
  for (const networkName of Object.keys(supportedNetworks)) {
    const providers = registeredPlugin.getProvidersForNetwork(networkName as NetworkName);
    console.log(`Network ${networkName}:`, providers.map(p => p.getName()).join(', '));
  }
  console.log();
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
