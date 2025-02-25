export enum NetworkName {
  ETHEREUM = 'ethereum',
  POLYGON = 'polygon',
  ARBITRUM = 'arbitrum',
  OPTIMISM = 'optimism',
  BNB = 'bnb',
  SOLANA = 'solana',
  SEPOLIA = 'sepolia',
  SOLANA_DEVNET = 'solana-devnet',
}

export interface BaseNetworkConfig {
  rpcUrl: string;
  name: string;
  blockExplorerUrl?: string;
}

export interface EVMNetworkConfig extends BaseNetworkConfig {
  chainId: number;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
}

export interface SolanaNetworkConfig extends BaseNetworkConfig {}

export type NetworkType = 'evm' | 'solana';

export interface NetworkConfig {
  type: NetworkType;
  config: EVMNetworkConfig | SolanaNetworkConfig;
}

export interface NetworksConfig {
  networks: Partial<Record<NetworkName, NetworkConfig>>;
}

export interface Token {
  address: string;
  decimals: number;
  symbol: string;
}
