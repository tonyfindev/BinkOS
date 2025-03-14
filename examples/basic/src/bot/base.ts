// import { ethers } from 'ethers';
// import { Wallet, Network, settings, NetworkType, NetworksConfig, NetworkName } from '@binkai/core';

// import { Agent } from '@binkai/core';

// import { BridgePlugin } from '@binkai/bridge-plugin';
// import { deBridgeProvider } from '@binkai/debridge-provider';
// import { TokenPlugin } from '@binkai/token-plugin';
// import { SwapPlugin } from '@binkai/swap-plugin';
// import { OkxProvider } from '@binkai/okx-provider';
// import { OkuProvider } from '@binkai/oku-provider';
// import { BirdeyeProvider } from '@binkai/birdeye-provider';

// console.log('🚀 Starting BinkOS base initialization...\n');

// const BNB_RPC = 'https://bsc-dataseed1.binance.org';
// const ETH_RPC = 'https://eth.llamarpc.com';
// const SOL_RPC = 'https://api.mainnet-beta.solana.com';

// async function check_env_variables() {
//   // Check required environment variables
//   if (!settings.has('OPENAI_API_KEY')) {
//     console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
//     process.exit(1);
//   }

//   console.log('🔑 OpenAI API key found\n');
// }

// async function initialize_networks() {
//   console.log('📡 Configuring networks...');
//   const networks: NetworksConfig['networks'] = {
//     [NetworkName.SOLANA]: {
//       type: 'solana' as NetworkType,
//       config: {
//         rpcUrl: SOL_RPC,
//         name: 'Solana',
//         nativeCurrency: {
//           name: 'Solana',
//           symbol: 'SOL',
//           decimals: 9,
//         },
//       },
//     },
//     [NetworkName.BNB]: {
//       type: 'evm' as NetworkType,
//       config: {
//         chainId: 56,
//         rpcUrl: BNB_RPC,
//         name: 'BNB Chain',
//         nativeCurrency: {
//           name: 'BNB',
//           symbol: 'BNB',
//           decimals: 18,
//         },
//       },
//     },
//   };
//   console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

//   // Initialize network
//   console.log('🌐 Initializing network...');
//   const network = new Network({ networks });
//   console.log('✓ Network initialized\n', network);
//   return { network, networks };
// }

// async function initialize_base_provider() {
//   // Initialize provider
//   console.log('🔌 Initializing provider...');
//   const provider = new ethers.JsonRpcProvider(BNB_RPC);
//   //const provider =  new anchor.web3.Connection(SOL_RPC);
//   console.log('✓ Provider initialized\n');
//   return provider;
// }

// async function initialize_wallet(network: Network) {
//   // Initialize a new wallet
//   console.log('👛 Creating wallet...');
//   const wallet = new Wallet(
//     {
//       seedPhrase: settings.get('WALLET_MNEMONIC') || '',
//       index: 8,
//     },
//     network,
//   );
//   return wallet;
// }

// async function initialize_agent(wallet: Wallet, networks: NetworksConfig['networks']) {
//   console.log('🤖 Initializing AI agent...');
//   const agent = new Agent(
//     {
//       model: 'gpt-4o',
//       temperature: 0,
//       systemPrompt:
//         'You are a BINK AI agent. You are able to perform bridge and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a bridge.',
//     },
//     wallet,
//     networks,
//   );
//   console.log('✓ Agent initialized\n');
//   return agent;
// }

// async function initialize_plugins() {
//   // Create and configure the Bridge plugin
//   console.log('🔄 Initializing bridge plugin...');

//   const bridgePlugin = new BridgePlugin();
//   const swapPlugin = new SwapPlugin();
//   const tokenPlugin = new TokenPlugin();

//   return { bridgePlugin, swapPlugin, tokenPlugin };
// }

// async function initialize_providers(provider: ethers.JsonRpcProvider) {
//   const okxProvider = new OkxProvider(provider, 56);
//   const okuProvider = new OkuProvider(provider, 56);
//   const debridge = new deBridgeProvider(provider, 56, 7565164);
//   const birdeye = new BirdeyeProvider({
//     apiKey: settings.get('BIRDEYE_API_KEY'),
//   });
//   console.log('✓ Providers initialized\n');
//   return { okuProvider, okxProvider, debridge, birdeye };
// }

// async function initialize_tools(
//   agent: Agent,
//   tokenPlugin: TokenPlugin,
//   bridgePlugin: BridgePlugin,
//   birdeye: BirdeyeProvider,
//   debridge: deBridgeProvider,
//   okuProvider: OkuProvider,
//   okxProvider: OkxProvider,
//   swapPlugin: SwapPlugin,
// ) {
//   // Configure the plugin with supported chains
//   await tokenPlugin.initialize({
//     defaultChain: 'bnb',
//     providers: [birdeye],
//     supportedChains: ['solana', 'bnb'],
//   });

//   // Initialize the bridge plugin
//   await bridgePlugin.initialize({
//     defaultChain: 'bnb',
//     providers: [debridge],
//     supportedChains: ['bnb', 'solana'], // These will be intersected with agent's networks
//   });

//   await swapPlugin.initialize({
//     defaultSlippage: 0.5,
//     defaultChain: 'bnb',
//     providers: [okxProvider, okuProvider],
//     supportedChains: ['bnb', 'ethereum'], // These will be intersected with agent's networks
//   });

//   // Register the plugin with the agent

//   await agent.registerListPlugins([swapPlugin, tokenPlugin, bridgePlugin]);
//   console.log('✓ Tools registered\n');
// }

// export async function config_agent_with_tools() {
//   await check_env_variables();
//   const { network, networks } = await initialize_networks();
//   const wallet = await initialize_wallet(network);
//   const agent = await initialize_agent(wallet, networks);

//   const base_provider = await initialize_base_provider();
//   const { okuProvider, okxProvider, debridge, birdeye } = await initialize_providers(base_provider);

//   const { bridgePlugin, swapPlugin, tokenPlugin } = await initialize_plugins();

//   await initialize_tools(
//     agent,
//     tokenPlugin,
//     bridgePlugin,
//     birdeye,
//     debridge,
//     okuProvider,
//     okxProvider,
//     swapPlugin,
//   );
//   return agent;
// }
