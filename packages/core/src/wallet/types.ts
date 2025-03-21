import { Transaction as SolanaTransaction, VersionedTransaction } from '@solana/web3.js';
import { Transaction as EvmTransaction } from 'ethers';
import { NetworkName } from '../network/types';

export type TransactionType = EvmTransaction | SolanaTransaction | VersionedTransaction;

export interface WalletConfig {
  seedPhrase: string;
  index?: number;
}

export interface SignMessageParams {
  network: NetworkName;
  message: string;
}

export interface SignTransactionParams {
  network: NetworkName;
  transaction: TransactionType;
}

export interface TransactionRequest {
  to: string;
  data: string;
  value: bigint;
  gasLimit?: bigint;
  lastValidBlockHeight?: number;
}

export interface TransactionReceipt {
  hash: string;
  wait(): Promise<TransactionReceipt>;
}

export interface IWallet {
  getAddress(network: NetworkName): Promise<string>;
  signMessage(params: SignMessageParams): Promise<string>;
  signTransaction(params: SignTransactionParams): Promise<string>;
  getPublicKey(network: NetworkName): string;
  getPrivateKey(network: NetworkName): string;

  /**
   * Send a transaction to the network
   * @param network The network to send the transaction on
   * @param transaction The transaction request to send
   */
  sendTransaction(
    network: NetworkName,
    transaction: TransactionRequest,
  ): Promise<TransactionReceipt>;

  /**
   * Sign and send a transaction to the network
   * @param network The network to send the transaction on
   * @param transaction The transaction request to sign and send
   */
  signAndSendTransaction(
    network: NetworkName,
    transaction: TransactionRequest,
  ): Promise<TransactionReceipt>;
}
