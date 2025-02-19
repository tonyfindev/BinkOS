import { ethers } from 'ethers';
import { Agent, Wallet, Network, settings, NetworkType, NetworksConfig } from '@binkai/core';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { VersionedTransaction } from '@solana/web3.js';
import * as anchor from "@coral-xyz/anchor";
import { NATIVE_MINT } from '@solana/spl-token';
// Hardcoded RPC URLs for demonstration
const BNB_RPC = 'https://bsc-dataseed1.binance.org';  
const ETH_RPC = 'https://eth.llamarpc.com';
const SOL_RPC = 'https://api.mainnet-beta.solana.com';

async function main() {
  console.log('🚀 Starting BinkOS bridge example...\n');

  // Check required environment variables
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }

  console.log('🔑 OpenAI API key found\n');

  // Define available networks
  console.log('📡 Configuring networks...');
  const networks: NetworksConfig['networks'] = {
    solana: {
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
  };
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...' );
  const network = new Network({ networks });
  console.log('✓ Network initialized\n', network);

  // Initialize provider
  console.log('🔌 Initializing provider...');
  const provider = new ethers.JsonRpcProvider(BNB_RPC);
  //const provider =  new anchor.web3.Connection(SOL_RPC);
  console.log('✓ Provider initialized\n');

  // Initialize a new wallet
  console.log('👛 Creating wallet...');
  const wallet = new Wallet({
    seedPhrase: settings.get('WALLET_MNEMONIC') || '',
    index: 8
  }, network);

  const walletEvm = new Wallet({
    seedPhrase: settings.get('WALLET_MNEMONIC_EVM') || '',
    index: 0
  }, network);
  console.log("🚀 ~ main ~ walletEvm:", walletEvm)

  // Create an agent with OpenAI
  console.log('🤖 Initializing AI agent...');
  const agent = new Agent({
    model: 'gpt-4o',
    temperature: 0,
  }, walletEvm, networks);
  console.log('✓ Agent initialized\n');

  // Create and configure the Bridge plugin
  console.log('🔄 Initializing bridge plugin...');
  const bridgePlugin = new BridgePlugin();
  
  // Create providers with proper chain IDs
  const debridge = new deBridgeProvider(provider);

  // Configure the plugin with supported chains
  await bridgePlugin.initialize({
      fromChain: "bnb",
      toChain: "solana",
      defaultChain: 'bnb',
      providers: [debridge],
      supportedChains: ['bnb', 'solana'], // These will be intersected with agent's networks
  });
  
    await bridgePlugin.initialize({
    fromChain: "solana",
    toChain: "bnb",
    defaultChain: 'solana',
    providers: [debridge],
    supportedChains: ['bnb', 'solana'], // These will be intersected with agent's networks
  });

  
  console.log('✓ Bridge plugin initialized\n');

  // Register the plugin with the agent
  console.log('🔌 Registering bridge plugin with agent...');
  await agent.registerPlugin(bridgePlugin);
  console.log('✓ Plugin registered\n');

  // Example 1: Bridge exact 1 USDT for BNB on BNB Chain
  //console.log('💱 Example 1:Bridge SOL to BNB on DeBridge Finance');
  // const inputResult = await agent.execute({
  //   input: `
  //     Bridge exactly native token 1000 SOL to native token BNB on DeBridge Finance with via solana chain.
  //     Use the following token addresses:
  //     from token: ${NATIVE_MINT}
  //     token: ${NATIVE_MINT}
  //     wallet: ${wallet.getPublicKey('solana')}
  //     wallet receive : ${ await walletEvm.getAddress('bnb')}
  //   `
  // });
  console.log('💱 Example 2:Bridge BNB to SOL on DeBridge Finance');
  const inputResult = await agent.execute({
    input: `
      Bridge exactly native token 0.1 BNB to native token SOL on DeBridge Finance with via binance chain.
      Use the following token addresses:
      from token: ${"0xf5C6825015280CdfD0b56903F9F8B5A2233476F5"}
      token: ${NATIVE_MINT}
      wallet: ${ await walletEvm.getAddress('bnb')}
      wallet receive : ${wallet.getPublicKey('solana')}
    `
  });
  console.log('✓ Bridge result (input):', inputResult, '\n');

  // Get plugin information
  const registeredPlugin = agent.getPlugin('bridge') as BridgePlugin;
  
  // Check available providers for each chain
  // console.log('📊 Available providers by chain:');
  const chains = registeredPlugin.getSupportedChains();
  for (const chain of chains) {
    const providers = registeredPlugin.getProvidersForChain(chain);
    console.log(`Chain ${chain}:`, providers.map(p => p.getName()).join(', '));
  }
  console.log('✓ Available providers:', chains.join(', '));
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
}); 