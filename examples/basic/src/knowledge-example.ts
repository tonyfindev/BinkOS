import { Agent, Wallet, Network, settings, NetworkType, NetworksConfig } from '@binkai/core';
import { KnowledgePlugin } from '@binkai/knowledge-plugin';
import { BinkProvider } from '@binkai/bink-provider';

async function main() {
  // Initialize plugin
  const knowledgePlugin = new KnowledgePlugin();

  const BNB_RPC = 'https://bsc-dataseed1.binance.org';

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
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

  console.log('🤖 Wallet BNB:', await wallet.getAddress('bnb'));

  // Create agent instance
  const agent = new Agent(
    {
      model: 'gpt-4o-mini',
      temperature: 0,
    },
    wallet,
    networks,
  );
  console.log('✓ Agent initialized\n');

  // Create Bink provider with API key
  const binkProvider = new BinkProvider({
    apiKey: settings.get('BINK_API_KEY') || '',
    baseUrl: settings.get('BINK_API_URL') || '',
  });

  // Initialize plugin with provider
  await knowledgePlugin.initialize({
    providers: [binkProvider],
  });

  // Register with agent
  await agent.registerPlugin(knowledgePlugin);

  // Example query
  const result = await agent.execute({
    input: 'What is the purpose of the BinkAI project?',
  });

  console.log('Query result:', result);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
