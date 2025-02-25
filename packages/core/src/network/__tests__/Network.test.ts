import { ethers } from 'ethers';
import { Connection } from '@solana/web3.js';
import { Network } from '../Network';
import { NetworkName, NetworksConfig, NetworkType } from '../types';

describe('Network', () => {
  const testConfig: NetworksConfig = {
    networks: {
      sepolia: {
        type: 'evm' as NetworkType,
        config: {
          rpcUrl: 'https://rpc.sepolia.org',
          chainId: 11155111,
          name: 'Sepolia',
          nativeCurrency: {
            name: 'Sepolia Ether',
            symbol: 'ETH',
            decimals: 18,
          },
        },
      },
      'solana-devnet': {
        type: 'solana' as NetworkType,
        config: {
          rpcUrl: 'https://api.devnet.solana.com',
          name: 'Solana Devnet',
          blockExplorerUrl: 'https://explorer.solana.com/?cluster=devnet',
        },
      },
    },
  };

  let network: Network;

  beforeEach(() => {
    network = new Network(testConfig);
  });

  describe('constructor', () => {
    it('should initialize with valid config', () => {
      expect(() => new Network(testConfig)).not.toThrow();
    });

    it('should throw error when no networks configured', () => {
      expect(() => new Network({ networks: {} })).toThrow('No networks configured');
    });
  });

  describe('getProvider', () => {
    it('should return EVM provider for Sepolia', () => {
      const provider = network.getProvider(NetworkName.SEPOLIA, 'evm');
      expect(provider).toBeInstanceOf(ethers.JsonRpcProvider);
    });

    it('should return Solana provider for devnet', () => {
      const provider = network.getProvider(NetworkName.SOLANA_DEVNET, 'solana');
      expect(provider).toBeInstanceOf(Connection);
    });

    it('should throw error for non-existent network', () => {
      expect(() => network.getProvider('non-existent' as any, 'evm')).toThrow(
        'Provider not found for network: non-existent',
      );
    });

    it('should throw error for wrong network type', () => {
      expect(() => network.getProvider(NetworkName.SEPOLIA, 'solana')).toThrow(
        'Network sepolia is not of type solana',
      );
    });
  });

  describe('getConfig', () => {
    it('should return correct config for existing network', () => {
      const config = network.getConfig(NetworkName.SEPOLIA);
      expect(config).toEqual(testConfig.networks.sepolia);
    });

    it('should throw error for non-existent network', () => {
      expect(() => network.getConfig('non-existent' as any)).toThrow(
        'Network configuration not found for: non-existent',
      );
    });
  });

  describe('getNetworks', () => {
    it('should return all configured networks', () => {
      const networks = network.getNetworks();
      expect(networks).toEqual(['sepolia', 'solana-devnet']);
    });
  });

  describe('isSupported', () => {
    it('should return true for supported networks', () => {
      expect(network.isSupported(NetworkName.SEPOLIA)).toBe(true);
      expect(network.isSupported(NetworkName.SOLANA_DEVNET)).toBe(true);
    });

    it('should return false for unsupported networks', () => {
      expect(network.isSupported('non-existent' as any)).toBe(false);
    });
  });

  describe('getNetworkType', () => {
    it('should return correct network type', () => {
      expect(network.getNetworkType(NetworkName.SEPOLIA)).toBe('evm');
      expect(network.getNetworkType(NetworkName.SOLANA_DEVNET)).toBe('solana');
    });

    it('should throw error for non-existent network', () => {
      expect(() => network.getNetworkType('non-existent' as any)).toThrow(
        'Network configuration not found for: non-existent',
      );
    });
  });
});
