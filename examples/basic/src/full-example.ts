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
import { OkxProvider } from '@binkai/okx-provider';
import { ThenaProvider } from '@binkai/thena-provider';
import { JupiterProvider } from '@binkai/jupiter-provider';
import { Connection } from '@solana/web3.js';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { BridgePlugin } from '@binkai/bridge-plugin';
import { deBridgeProvider } from '@binkai/debridge-provider';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { ChainId } from '@pancakeswap/sdk';
import { TokenPlugin } from '@binkai/token-plugin';
import { WalletPlugin } from '@binkai/wallet-plugin';
import { BnbProvider } from '@binkai/rpc-provider';

// RPC URL constants
const RPC_URLS = {
  BNB: 'https://bsc-dataseed1.binance.org',
  ETH: 'https://eth.llamarpc.com',
  SOL: 'https://api.mainnet-beta.solana.com',
};

async function main() {
  console.log('🚀 Starting BinkOS swap example...\n');

  // Validate environment
  validateEnvironment();

  // Setup network configuration
  const networks = configureNetworks();
  console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

  // Initialize network
  console.log('🌐 Initializing network...');
  const network = new Network({ networks });
  console.log('✓ Network initialized\n');

  // Initialize providers
  const providers = initializeProviders();
  console.log('✓ Providers initialized\n');

  // Initialize wallet
  const wallet = await initializeWallet(network);

  // Display wallet addresses
  await displayWalletAddresses(wallet);

  // Initialize agent
  const agent = initializeAgent(wallet, networks);
  console.log('✓ Agent initialized\n');

  // Initialize plugins
  const { swapPlugin, tokenPlugin, bridgePlugin, walletPlugin } =
    await initializePlugins(providers);

  // Register plugins with agent
  console.log('🔌 Registering plugins with agent...');
  await agent.registerListPlugins([swapPlugin, tokenPlugin, bridgePlugin, walletPlugin]);
  console.log('✓ Plugins registered\n');

  // Execute swap example
  await executeSwapExample(agent);

  // Display provider information
  displayProviderInfo(agent);
}

function validateEnvironment() {
  if (!settings.has('OPENAI_API_KEY')) {
    console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
    process.exit(1);
  }
  console.log('🔑 OpenAI API key found\n');
}

function configureNetworks() {
  console.log('📡 Configuring networks...');
  return {
    [NetworkName.SOLANA]: {
      type: 'solana' as NetworkType,
      config: {
        rpcUrl: RPC_URLS.SOL,
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
        rpcUrl: RPC_URLS.BNB,
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
        rpcUrl: RPC_URLS.ETH,
        name: 'Ethereum',
        nativeCurrency: {
          name: 'Ether',
          symbol: 'ETH',
          decimals: 18,
        },
      },
    },
  };
}

function initializeProviders() {
  console.log('🔌 Initializing providers...');
  return {
    bnb: new ethers.JsonRpcProvider(RPC_URLS.BNB),
    sol: new Connection(RPC_URLS.SOL),
    eth: new ethers.JsonRpcProvider(RPC_URLS.ETH),
  };
}

async function initializeWallet(network: any) {
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
  return wallet;
}

async function displayWalletAddresses(wallet: any) {
  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));
  console.log('🤖 Wallet ETH:', await wallet.getAddress(NetworkName.ETHEREUM));
  console.log('🤖 Wallet SOL:', await wallet.getAddress(NetworkName.SOLANA));
}

function initializeAgent(wallet: any, networks: any) {
  console.log('🤖 Initializing AI agent...');
  return new Agent(
    {
      model: 'gpt-4o',
      temperature: 0,
    },
    wallet,
    networks,
  );
}

async function initializePlugins(providers: any) {
  // Initialize Birdeye provider
  const birdeye = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  // Initialize Token plugin
  const tokenPlugin = new TokenPlugin();
  await tokenPlugin.initialize({
    providers: [birdeye],
    supportedChains: ['solana', 'bnb', 'ethereum'],
  });
  console.log('✓ Token plugin initialized\n');

  // Initialize Wallet plugin
  console.log('🔄 Initializing wallet plugin...');
  const walletPlugin = new WalletPlugin();
  const bnbProvider = new BnbProvider({
    rpcUrl: RPC_URLS.BNB,
  });
  await walletPlugin.initialize({
    defaultChain: 'bnb',
    providers: [bnbProvider],
    supportedChains: ['bnb', 'solana', 'ethereum'],
  });

  // Initialize Swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();
  const okx = new OkxProvider(providers.bnb, 56);
  const jupiter = new JupiterProvider(providers.sol);
  const thena = new ThenaProvider(providers.eth, 1);
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    providers: [okx, thena, jupiter],
    supportedChains: ['bnb', 'ethereum', 'solana'],
  });
  console.log('✓ Swap plugin initialized\n');

  // Initialize Bridge plugin
  const bridgePlugin = new BridgePlugin();
  const debridge = new deBridgeProvider(providers.bnb, 56, 7565164);
  await bridgePlugin.initialize({
    providers: [debridge],
    supportedChains: ['bnb', 'solana'],
  });

  return { swapPlugin, tokenPlugin, bridgePlugin, walletPlugin };
}

async function executeSwapExample(agent: any) {
  console.log('💱 Example 1: Buy with exact input amount all providers');
  const result = await agent.execute({
    input: `swap all my usdc to SOL`,
  });
  console.log('✓ Result:', result, '\n');
}

function displayProviderInfo(agent: any) {
  const registeredPlugin = agent.getPlugin('swap') as SwapPlugin;
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
