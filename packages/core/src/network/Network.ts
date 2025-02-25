import { ethers } from 'ethers';
import { Connection } from '@solana/web3.js';
import {
  NetworksConfig,
  NetworkConfig,
  EVMNetworkConfig,
  SolanaNetworkConfig,
  NetworkName,
  NetworkType,
} from './types';

export class Network {
  readonly #config: NetworksConfig;
  readonly #providers: Map<NetworkName, ethers.JsonRpcProvider | Connection>;

  constructor(config: NetworksConfig) {
    if (Object.keys(config.networks).length === 0) {
      throw new Error('No networks configured');
    }

    this.#config = config;
    this.#providers = new Map();
    this.#initialize();
  }

  #initialize(): void {
    for (const [name, config] of Object.entries(this.#config.networks)) {
      this.#initializeProvider(name as NetworkName, config);
    }
  }

  #initializeProvider(name: NetworkName, config: NetworkConfig): void {
    const provider = this.#createProvider(config);
    this.#providers.set(name, provider);
  }

  #createProvider(config: NetworkConfig): ethers.JsonRpcProvider | Connection {
    switch (config.type) {
      case 'evm':
        return new ethers.JsonRpcProvider((config.config as EVMNetworkConfig).rpcUrl);
      case 'solana':
        return new Connection((config.config as SolanaNetworkConfig).rpcUrl);
      default:
        throw new Error(`Unsupported network type: ${config.type}`);
    }
  }

  public getProvider<T extends NetworkType>(
    name: NetworkName,
    type: T,
  ): T extends 'evm' ? ethers.JsonRpcProvider : Connection {
    const provider = this.#providers.get(name);
    if (!provider) {
      throw new Error(`Provider not found for network: ${name}`);
    }

    const config = this.getConfig(name);
    if (config.type !== type) {
      throw new Error(`Network ${name} is not of type ${type}`);
    }

    return provider as T extends 'evm' ? ethers.JsonRpcProvider : Connection;
  }

  public getConfig(name: NetworkName): NetworkConfig {
    const config = this.#config.networks[name];
    if (!config) {
      throw new Error(`Network configuration not found for: ${name}`);
    }
    return config;
  }

  public getNetworks(): NetworkName[] {
    return Object.keys(this.#config.networks) as NetworkName[];
  }

  public isSupported(name: NetworkName): boolean {
    return name in this.#config.networks;
  }

  public getNetworkType(name: NetworkName): NetworkType {
    return this.getConfig(name).type;
  }
}
