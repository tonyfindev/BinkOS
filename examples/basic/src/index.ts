import { Agent, Wallet, Network, settings, NetworkType, NetworksConfig } from '@binkai/core';

async function main() {
  console.log('🚀 Starting BinkOS basic example (BNB Chain)...\n');

  // Define available networks
  console.log('📡 Configuring networks (BNB Chain)...');
  const networks: NetworksConfig['networks'] = {
    'bnb:testnet': {
      type: 'evm' as NetworkType,
      config: {
        rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
        chainId: 97,
        name: 'BNB Chain Testnet',
        blockExplorerUrl: 'https://testnet.bscscan.com'
      }
    },
    'solana:devnet': {
      type: 'solana' as NetworkType,
      config: {
        rpcUrl: 'https://api.devnet.solana.com',
        name: 'Solana Devnet (Secondary)',
        blockExplorerUrl: 'https://explorer.solana.com/?cluster=devnet'
      }
    }
  };
  console.log('✓ Networks configured - Primary:', Object.keys(networks)[0], '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet({
    seedPhrase: settings.get('WALLET_MNEMONIC') || 'test test test test test test test test test test test test junk',
    index: 0
  }, network);
  console.log('✓ Wallet created\n');

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent({
    model: 'gpt-4o',
    temperature: 1,
  }, wallet, networks);
  console.log('✓ Agent initialized\n');

  // Example interaction with the agent
  console.log('💬 Querying agent (BNB Chain)...\n');
  
  // Query BNB Chain address first
  const bnbResponse = await agent.execute({
    input: "What is my wallet's address on BNB Chain?"
  });
  console.log('🤖 Agent Response (BNB Chain):', bnbResponse, '\n');

  // Query Solana address second
  const solanaResponse = await agent.execute({
    input: "What is my wallet's address on Solana?"
  });
  console.log('🤖 Agent Response (Solana):', solanaResponse, '\n');

  // Get and display the actual wallet addresses for verification
  const bnbAddress = await wallet.getAddress('bnb:testnet');
  const solanaAddress = await wallet.getAddress('solana:devnet');
  console.log('✓ Primary - BNB Chain address:', bnbAddress);
  console.log('✓ Secondary - Solana address:', solanaAddress);
}

// Check if OPENAI_API_KEY is set
if (!settings.has('OPENAI_API_KEY')) {
  console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
  process.exit(1);
}

console.log('🔑 OpenAI API key found\n');

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
}); 
