import { NetworkName } from '@binkai/core';
import {
  ClaimParams,
  ClaimQuote,
  ClaimableBalances,
  NetworkProvider,
  StoredQuote,
  Transaction,
} from './types';

export abstract class BaseClaimProvider {
  protected providers: Map<NetworkName, NetworkProvider>;
  protected quotes: Map<string, StoredQuote> = new Map();
  protected TOLERANCE_PERCENTAGE = 0.5; // 0.5% tolerance for balance checks

  constructor(providers: Map<NetworkName, NetworkProvider>) {
    this.providers = providers;
  }

  /**
   * Get the name of the provider
   */
  abstract getName(): string;

  /**
   * Get the list of supported networks
   */
  abstract getSupportedNetworks(): NetworkName[];

  /**
   * Get a prompt that describes how to use this provider
   */
  abstract getPrompt(): string;

  /**
   * Get all claimable balances for a wallet address
   */
  abstract getAllClaimableBalances(walletAddress: string): Promise<ClaimableBalances>;

  /**
   * Build a transaction to claim a specific balance
   */
  abstract buildClaimTransaction(uuid: string): Promise<Transaction>;

  /**
   * Get a quote for claiming a specific balance
   */
  abstract getQuote(params: ClaimParams, userAddress: string): Promise<ClaimQuote>;

  /**
   * Validate that a network is supported
   */
  protected validateNetwork(network: NetworkName): void {
    if (!this.getSupportedNetworks().includes(network)) {
      throw new Error(`Network ${network} is not supported by ${this.getName()} provider`);
    }

    if (!this.providers.has(network)) {
      throw new Error(`No provider configured for network ${network}`);
    }
  }
}
