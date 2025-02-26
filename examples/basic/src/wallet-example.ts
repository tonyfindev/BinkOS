import { WalletPlugin } from '@binkai/wallet-plugin';
import { BnbProvider } from '@binkai/bnb-provider';
import {
  Agent,
  NetworkType,
  Network,
  NetworksConfig,
  settings,
  Wallet,
  NetworkName,
} from '@binkai/core';
import { SwapPlugin } from '@binkai/swap-plugin';
import { PancakeSwapProvider } from '@binkai/pancakeswap-provider';
import { ChainId } from '@pancakeswap/sdk';
import { ethers } from 'ethers';
import { BirdeyeProvider } from '@binkai/birdeye-provider';
import { TokenPlugin } from '@binkai/token-plugin';

async function main() {
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

  console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));

  // Create and configure the wallet plugin
  console.log('🔄 Initializing wallet plugin...');
  const walletPlugin = new WalletPlugin();
  // Create provider with API key
  const bnbProvider = new BnbProvider({
    rpcUrl: BNB_RPC,
  });
  // Create Birdeye provider with API key
  const birdeyeProvider = new BirdeyeProvider({
    apiKey: settings.get('BIRDEYE_API_KEY'),
  });

  // Initialize plugin with provider
  await walletPlugin.initialize({
    defaultChain: 'bnb',
    providers: [bnbProvider, birdeyeProvider],
    supportedChains: ['bnb'],
  });

  // Create and configure the swap plugin
  console.log('🔄 Initializing swap plugin...');
  const swapPlugin = new SwapPlugin();
  const provider = new ethers.JsonRpcProvider(BNB_RPC);
  // Create providers with proper chain IDs
  const pancakeswapProvider = new PancakeSwapProvider(provider, ChainId.BSC);
  await swapPlugin.initialize({
    defaultSlippage: 0.5,
    defaultChain: 'bnb',
    providers: [pancakeswapProvider],
    supportedChains: ['bnb'],
  });

  // Create and configure the token plugin
  console.log('🔍 Initializing token plugin...');
  const tokenPlugin = new TokenPlugin();
  await tokenPlugin.initialize({
    defaultChain: 'bnb',
    providers: [birdeyeProvider],
    supportedChains: ['solana', 'bnb'],
  });
  console.log('✓ Token plugin initialized\n');

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
  // Register with agent
  console.log('🔌 Registering wallet plugin with agent...');
  await agent.registerPlugin(walletPlugin);
  console.log('✓ Plugin registered\n');

  // Register the plugin with the agent
  console.log('🔌 Registering swap plugin with agent...');
  await agent.registerPlugin(swapPlugin);
  console.log('✓ Plugin registered\n');

  // Register the plugin with the agent
  console.log('🔌 Registering token plugin with agent...');
  await agent.registerPlugin(tokenPlugin);
  console.log('✓ Plugin registered\n');

  // Use the plugin through the agent
  const result = await agent.execute({
    // input: 'Get my wallet balance on bnb',
    // input: 'Buy BINK from half of my bnb on bnb chain.',
    // input: `
    //   Buy BINKAI from half of my wallet balance on bnb chain.
    //   Use the following token addresses:
    //    BINKAI: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
    // `,
    input: `
      Buy Broccoli from half of my wallet balance on bnb chain`,
    //   input: `
    //   Buy BINK from with 0.5 bnb from my wallet.
    //   Use the following token addresses:
    //    BINKAI: 0x5fdfaFd107Fc267bD6d6B1C08fcafb8d31394ba1
    // `,
  });
  console.log('Query result:', result);
}

main().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});
