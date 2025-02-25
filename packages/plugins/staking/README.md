# @binkai/staking-plugin

A comprehensive staking plugin for BinkOS that enables cross-chain staking operations with intelligent yield optimization and multiple protocol support.

## Overview

The staking plugin provides seamless integration with various staking protocols and enables AI-powered staking operations through the BinkOS agent system. It supports multiple chains and automatically finds the best staking opportunities for optimal yields.

## Features

- 🏦 **Multi-Protocol Support**: Integration with major staking protocols

  - PancakeSwap (BNB Chain)
  - Venus (BNB Chain)
  - Marinade (Solana)
  - Lido (Ethereum)
  - Binance Staking (Multi-chain)

- 🤖 **AI-Powered Optimization**: Intelligent yield optimization
- ⚡ **Cross-Chain Compatibility**: Support for multiple blockchain networks
- 🔒 **Lock Period Management**: Flexible staking duration options
- 🔌 **Extensible Providers**: Easy integration of new staking providers

## Installation

```bash
# Install as a dependency in your project
pnpm add @binkai/staking-plugin

# Install required peer dependencies
pnpm add @binkai/core ethers
```

## Usage

Here's how to integrate and use the staking plugin with BinkOS:

```typescript
import { StakingPlugin } from '@binkai/staking-plugin';
import { VenusStakingProvider } from '@binkai/venus-provider';

// Initialize providers
const provider = new ethers.JsonRpcProvider('https://bsc-dataseed1.binance.org');
const venusStaking = new VenusStakingProvider(provider, 56);

// Create and configure the staking plugin
const stakingPlugin = new StakingPlugin();
await stakingPlugin.initialize({
  defaultLockPeriod: 30, // days
  defaultChain: 'bnb',
  providers: [venusStaking],
  supportedChains: ['bnb', 'ethereum'],
});

// Register with BinkOS agent
await agent.registerPlugin(stakingPlugin);

// Execute staking operations through natural language
const result = await agent.execute({
  input: 'Stake 0.01 BNB with auto-compound on bnb chain',
});
```

## Detailed Examples

For a complete working example with all providers configured and advanced usage scenarios, see [examples/basic/src/example.ts](../../../examples/basic/src/example.ts).

## Supported Staking Providers

Each staking provider can be configured separately:

### Venus Staking

```typescript
const venusStaking = new VenusStakingProvider(provider, chainId);
```

## Configuration Options

The plugin accepts the following configuration options:

```typescript
interface StakingPluginConfig {
  defaultLockPeriod: number; // Default lock period in days
  defaultChain: string; // Default chain for operations
  providers: StakingProvider[]; // Array of staking providers
  supportedChains: string[]; // Supported blockchain networks
}
```

## Natural Language Commands

The plugin supports various natural language commands through the BinkOS agent:

- `Stake [amount] [token] for [period] days with auto-compound on [chain] chain`
- `Unstake [amount] [token] from [protocol] on [chain] chain`
- `Check staking rewards for [token] on [chain] chain`

## Development

```bash
# Install dependencies
pnpm install

# Build the plugin
pnpm build

# Run tests
pnpm test
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This package is part of the BinkOS project. All rights reserved.

## Related Packages

- [@binkai/core](../../core/README.md) - Core BinkOS functionality
- [@binkai/venus-provider](../providers/venus/README.md) - Venus integration
