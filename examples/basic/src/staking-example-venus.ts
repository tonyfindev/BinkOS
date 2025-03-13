// import { ethers } from 'ethers';
// import {
//   Agent,
//   Wallet,
//   Network,
//   settings,
//   NetworkType,
//   NetworksConfig,
//   NetworkName,
//   IToolExecutionCallback,
//   ToolExecutionState,
//   ToolExecutionData,
// } from '@binkai/core';
// import { StakingPlugin } from '@binkai/staking-plugin';
// import { VenusProvider } from '@binkai/venus-provider';
// import { WalletPlugin } from '@binkai/wallet-plugin';
// // import { BnbProvider } from '@binkai/bnb-provider';
// import { BirdeyeProvider } from '@binkai/birdeye-provider';
// // Hardcoded RPC URLs for demonstration
// const BNB_RPC = 'https://bsc-dataseed1.binance.org';
// const ETH_RPC = 'https://eth.llamarpc.com';

// class ExampleToolExecutionCallback implements IToolExecutionCallback {
//   onToolExecution(data: ToolExecutionData): void {
//     const stateEmoji = {
//       [ToolExecutionState.STARTED]: '🚀',
//       [ToolExecutionState.IN_PROCESS]: '⏳',
//       [ToolExecutionState.COMPLETED]: '✅',
//       [ToolExecutionState.FAILED]: '❌',
//     };

//     const emoji = stateEmoji[data.state] || '🔄';

//     console.log(`${emoji} [${new Date(data.timestamp).toISOString()}] ${data.message}`);

//     if (data.state === ToolExecutionState.IN_PROCESS && data.data) {
//       console.log(`   Progress: ${data.data.progress || 0}%`);
//     }

//     if (data.state === ToolExecutionState.COMPLETED && data.data) {
//       console.log(
//         `   Result: ${JSON.stringify(data.data).substring(0, 100)}${JSON.stringify(data.data).length > 100 ? '...' : ''}`,
//       );
//     }

//     if (data.state === ToolExecutionState.FAILED && data.error) {
//       console.log(`   Error: ${data.error.message || String(data.error)}`);
//     }
//   }
// }

// async function main() {
//   console.log('🚀 Starting BinkOS staking example...\n');

//   // Check required environment variables
//   if (!settings.has('OPENAI_API_KEY')) {
//     console.error('❌ Error: Please set OPENAI_API_KEY in your .env file');
//     process.exit(1);
//   }

//   console.log('🔑 OpenAI API key found\n');

//   // Define available networks
//   console.log('📡 Configuring networks...');
//   const networks: NetworksConfig['networks'] = {
//     bnb: {
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
//     ethereum: {
//       type: 'evm' as NetworkType,
//       config: {
//         chainId: 1,
//         rpcUrl: ETH_RPC,
//         name: 'Ethereum',
//         nativeCurrency: {
//           name: 'Ether',
//           symbol: 'ETH',
//           decimals: 18,
//         },
//       },
//     },
//   };
//   console.log('✓ Networks configured:', Object.keys(networks).join(', '), '\n');

//   // Initialize network
//   console.log('🌐 Initializing network...');
//   const network = new Network({ networks });
//   console.log('✓ Network initialized\n');

//   // Initialize provider
//   console.log('🔌 Initializing provider...');
//   const provider = new ethers.JsonRpcProvider(BNB_RPC);
//   console.log('✓ Provider initialized\n');

//   // Initialize a new wallet
//   console.log('👛 Creating wallet...');
//   const wallet = new Wallet(
//     {
//       seedPhrase:
//         settings.get('WALLET_MNEMONIC') ||
//         'test test test test test test test test test test test junk',
//       index: 0,
//     },
//     network,
//   );

//   console.log('✓ Wallet created\n');

//   console.log('🤖 Wallet BNB:', await wallet.getAddress(NetworkName.BNB));

//   // Create and configure the wallet plugin
//   console.log('🔄 Initializing wallet plugin...');
//   const walletPlugin = new WalletPlugin();
//   // Create provider with API key
//   const bnbProvider = new VenusProvider({
//     rpcUrl: BNB_RPC,
//   });
//   // Create Birdeye provider with API key
//   const birdeyeProvider = new BirdeyeProvider({
//     apiKey: settings.get('BIRDEYE_API_KEY'),
//   });

//   // Initialize plugin with provider
//   await walletPlugin.initialize({
//     defaultChain: 'bnb',
//     providers: [bnbProvider, birdeyeProvider],
//     supportedChains: ['bnb'],
//   });
//   // Create an agent with OpenAI
//   console.log('🤖 Initializing AI agent...');
//   const agent = new Agent(
//     {
//       model: 'gpt-4o',
//       temperature: 0,
//       systemPrompt:
//         'You are a BINK AI agent. You are able to perform swaps and get token information on multiple chains. If you do not have the token address, you can use the symbol to get the token information before performing a staking or unstaking.',
//     },
//     wallet,
//     networks,
//   );
//   console.log('✓ Agent initialized\n');

//   // Register the tool execution callback
//   console.log('🔔 Registering tool execution callback...');
//   agent.registerToolExecutionCallback(new ExampleToolExecutionCallback());
//   console.log('✓ Callback registered\n');

//   // Register with agent
//   console.log('🔌 Registering wallet plugin with agent...');
//   await agent.registerPlugin(walletPlugin);
//   console.log('✓ Plugin registered\n');

//   // Create and configure the staking plugin
//   console.log('🔄 Initializing staking plugin...');
//   const stakingPlugin = new StakingPlugin();

//   // Create providers with proper chain IDs
//   const venus = new VenusProvider(provider, 56);

//   // Configure the plugin with supported chains
//   await stakingPlugin.initialize({
//     defaultSlippage: 0.5,
//     defaultChain: 'bnb',
//     providers: [venus],
//     supportedChains: ['bnb', 'ethereum'], // These will be intersected with agent's networks
//   });
//   console.log('✓ Staking plugin initialized\n');

//   // // Register the plugin with the agent
//   console.log('🔌 Registering staking plugin with agent...');
//   await agent.registerPlugin(stakingPlugin);
//   console.log('✓ Plugin registered\n');

//   console.log('💱 Example 1: Stake 10% BNB on Venus');
//   const inputResult = await agent.execute({
//     input: `
//       Supply 10% of my BNB balance on Venus.
//     `,
//   });
//   console.log('✓ Staking result (input):', inputResult, '\n');

//   console.log('💱 Example 2: Unstake all BNB on Venus');
//   const outputResult = await agent.execute({
//     input: `
//       Withdraw all BNB from Venus.
//     `,
//   });
//   console.log('✓ Staking result (input):', outputResult, '\n');
//   // Get plugin information
//   // const registeredPlugin = agent.getPlugin('staking') as StakingPlugin;

//   // // Check available providers for each chain
//   // console.log('📊 Available providers by chain:');
//   // const chains = registeredPlugin.getSupportedNetworks();
//   // for (const chain of chains) {
//   //   const providers = registeredPlugin.getProvidersForNetwork(chain);
//   //   console.log(`Chain ${chain}:`, providers.map(p => p.getName()).join(', '));
//   // }
//   // console.log();
// }

// main().catch(error => {
//   console.error('❌ Error:', error.message);
//   process.exit(1);
// });
