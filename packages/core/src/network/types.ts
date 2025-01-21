export type NetworkName = string;

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
  networks: Record<NetworkName, NetworkConfig>;
} 