import { ethers } from 'ethers';
import { Keypair, Transaction as SolanaTransaction, VersionedTransaction } from '@solana/web3.js';
import { mnemonicToSeedSync } from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import bs58 from 'bs58';
import nacl from 'tweetnacl';

import { Network } from '../network';
import { NetworkName } from '../network/types';
import {
  WalletConfig,
  WalletInterface,
  SignMessageParams,
  SignTransactionParams,
  TransactionType
} from './types';

export class Wallet implements WalletInterface {
  readonly #evmWallet: ethers.HDNodeWallet;
  readonly #solanaKeypair: Keypair;
  readonly #network: Network;

  constructor(config: WalletConfig, network: Network) {
    this.#network = network;
    
    // Initialize EVM wallet
    this.#evmWallet = ethers.HDNodeWallet.fromPhrase(
      config.seedPhrase,
      `m/44'/60'/0'/0/${config.index}`
    );

    // Initialize Solana wallet
    const seed = mnemonicToSeedSync(config.seedPhrase);
    const derivedPath = `m/44'/501'/${config.index}'/0'`;
    const keyPair = derivePath(derivedPath, seed.toString('hex'));
    this.#solanaKeypair = Keypair.fromSeed(keyPair.key);
  }

  public async getAddress(network: NetworkName): Promise<string> {
    const networkType = this.#network.getNetworkType(network);
    
    if (networkType === 'evm') {
      return this.#evmWallet.address;
    } else {
      return this.#solanaKeypair.publicKey.toString();
    }
  }

  public async signMessage(params: SignMessageParams): Promise<string> {
    const networkType = this.#network.getNetworkType(params.network);
    
    if (networkType === 'evm') {
      return await this.#evmWallet.signMessage(params.message);
    } else {
      const messageBytes = new TextEncoder().encode(params.message);
      const signature = nacl.sign.detached(
        messageBytes,
        this.#solanaKeypair.secretKey
      );
      return bs58.encode(signature);
    }
  }

  public async signTransaction(params: SignTransactionParams): Promise<string> {
    const networkType = this.#network.getNetworkType(params.network);
    const transaction = params.transaction as TransactionType;

    if (networkType === 'evm') {
      const evmTx = transaction as ethers.Transaction;
      return await this.#evmWallet.signTransaction(evmTx);
    } else {
      if (transaction instanceof VersionedTransaction) {
        transaction.sign([this.#solanaKeypair]);
        return Buffer.from(transaction.serialize()).toString('base64');
      } else if (transaction instanceof SolanaTransaction) {
        transaction.partialSign(this.#solanaKeypair);
        return Buffer.from(transaction.serialize()).toString('base64');
      }
      throw new Error('Invalid Solana transaction type');
    }
  }

  public getPublicKey(network: NetworkName): string {
    const networkType = this.#network.getNetworkType(network);
    
    if (networkType === 'evm') {
      return this.#evmWallet.publicKey;
    } else {
      return this.#solanaKeypair.publicKey.toBase58();
    }
  }

  public getPrivateKey(network: NetworkName): string {
    const networkType = this.#network.getNetworkType(network);
    
    if (networkType === 'evm') {
      return this.#evmWallet.privateKey;
    } else {
      return bs58.encode(this.#solanaKeypair.secretKey.slice(0, 32));
    }
  }
} 