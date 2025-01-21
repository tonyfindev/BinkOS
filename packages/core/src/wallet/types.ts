import { Transaction as SolanaTransaction, VersionedTransaction } from '@solana/web3.js';
import { Transaction as EVMTransaction } from 'ethers';
import { NetworkName } from '../network/types';

export interface WalletConfig {
  seedPhrase: string;
  index: number;
}

export type TransactionType = EVMTransaction | SolanaTransaction | VersionedTransaction;

export interface SignMessageParams {
  network: NetworkName;
  message: string;
}

export interface SignTransactionParams {
  network: NetworkName;
  transaction: TransactionType;
}

export interface IWallet {
  getAddress(network: NetworkName): Promise<string>;
  signMessage(params: SignMessageParams): Promise<string>;
  signTransaction(params: SignTransactionParams): Promise<string>;
} 