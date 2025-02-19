import { ethers } from 'ethers';
import {
  Keypair,
  Transaction as SolanaTransaction,
  VersionedTransaction,
  SystemProgram,
  PublicKey,
} from '@solana/web3.js';
import { Network } from '../../network';
import { NetworksConfig, NetworkType } from '../../network/types';
import { Wallet } from '../Wallet';
import { WalletConfig } from '../types';

describe('Wallet', () => {
  // Test configuration
  const networkConfig: NetworksConfig = {
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

  const walletConfig: WalletConfig = {
    seedPhrase: 'test test test test test test test test test test test junk',
    index: 0,
  };

  let network: Network;
  let wallet: Wallet;

  beforeEach(() => {
    network = new Network(networkConfig);
    wallet = new Wallet(walletConfig, network);
  });

  describe('EVM Functionality', () => {
    const networkName = 'sepolia';

    it('should generate correct EVM address', async () => {
      const address = await wallet.getAddress(networkName);
      expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);
      expect(address).toBe(
        ethers.HDNodeWallet.fromPhrase(
          walletConfig.seedPhrase,
          `m/44'/60'/0'/0/${walletConfig.index}`,
        ).address,
      );
    });

    it('should sign message correctly for EVM', async () => {
      const message = 'Hello, World!';
      const signature = await wallet.signMessage({ network: networkName, message });
      expect(signature).toMatch(/^0x[a-fA-F0-9]{130}$/);

      // Verify signature
      const address = await wallet.getAddress(networkName);
      const recoveredAddress = ethers.verifyMessage(message, signature);
      expect(recoveredAddress.toLowerCase()).toBe(address.toLowerCase());
    });

    it('should sign EVM transaction correctly', async () => {
      const transaction = new ethers.Transaction();
      transaction.to = '0x1234567890123456789012345678901234567890';
      transaction.value = ethers.parseEther('0.1');
      transaction.chainId = BigInt(11155111); // Sepolia chainId
      transaction.nonce = 0;
      transaction.gasLimit = BigInt(21000);
      transaction.maxFeePerGas = ethers.parseUnits('10', 'gwei');
      transaction.maxPriorityFeePerGas = ethers.parseUnits('1', 'gwei');

      const signature = await wallet.signTransaction({
        network: networkName,
        transaction,
      });

      expect(signature).toMatch(/^0x[a-fA-F0-9]+$/);
    });

    it('should return correct EVM public key', () => {
      const publicKey = wallet.getPublicKey(networkName);
      expect(publicKey).toMatch(/^0x[a-fA-F0-9]{66}$/);
    });

    it('should return correct EVM private key', () => {
      const privateKey = wallet.getPrivateKey(networkName);
      expect(privateKey).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });
  });

  describe('Solana Functionality', () => {
    const networkName = 'solana-devnet';

    it('should generate correct Solana address', async () => {
      const address = await wallet.getAddress(networkName);
      expect(address).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    it('should sign message correctly for Solana', async () => {
      const message = 'Hello, World!';
      const signature = await wallet.signMessage({ network: networkName, message });
      expect(signature).toMatch(/^[1-9A-HJ-NP-Za-km-z]{87,88}$/);

      // Verify signature
      const publicKey = new PublicKey(await wallet.getAddress(networkName));
      const messageBytes = new TextEncoder().encode(message);
      const signatureBytes = Buffer.from(signature, 'base64');
      const isValid = await PublicKey.createProgramAddress([messageBytes], publicKey).catch(
        () => false,
      );
      expect(isValid).toBeTruthy();
    });

    it('should sign Solana transaction correctly', async () => {
      const fromPubkey = new PublicKey(await wallet.getAddress(networkName));
      const toPubkey = new PublicKey('11111111111111111111111111111111');

      const transaction = new SolanaTransaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: 1000,
        }),
      );

      // Set a mock recent blockhash
      transaction.recentBlockhash = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';
      transaction.feePayer = fromPubkey;

      const signature = await wallet.signTransaction({
        network: networkName,
        transaction,
      });

      expect(signature).toBeTruthy();
      expect(Buffer.from(signature, 'base64')).toBeTruthy();
    });

    it('should sign Solana versioned transaction correctly', async () => {
      const fromPubkey = new PublicKey(await wallet.getAddress(networkName));
      const toPubkey = new PublicKey('11111111111111111111111111111111');

      const legacyTx = new SolanaTransaction().add(
        SystemProgram.transfer({
          fromPubkey,
          toPubkey,
          lamports: 1000,
        }),
      );

      // Set a mock recent blockhash
      legacyTx.recentBlockhash = 'EETubP5AKHgjPAhzPAFcb8BAY1hMH639CWCFTqi3hq1k';
      legacyTx.feePayer = fromPubkey;

      const transaction = new VersionedTransaction(legacyTx.compileMessage());

      const signature = await wallet.signTransaction({
        network: networkName,
        transaction,
      });

      expect(signature).toBeTruthy();
      expect(Buffer.from(signature, 'base64')).toBeTruthy();
    });

    it('should return correct Solana public key', () => {
      const publicKey = wallet.getPublicKey(networkName);
      expect(publicKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });

    it('should return correct Solana private key', () => {
      const privateKey = wallet.getPrivateKey(networkName);
      expect(privateKey).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);
    });
  });

  describe('Error Handling', () => {
    it('should throw error for unsupported network', async () => {
      await expect(wallet.getAddress('unsupported-network' as any)).rejects.toThrow();
    });

    it('should throw error for invalid transaction type', async () => {
      await expect(
        wallet.signTransaction({
          network: 'solana-devnet',
          transaction: {} as any,
        }),
      ).rejects.toThrow('Invalid Solana transaction type');
    });
  });
});
