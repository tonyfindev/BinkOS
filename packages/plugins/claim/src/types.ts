import { NetworkName, Token } from '@binkai/core';

export interface ClaimableBalance {
  uuid?: string | bigint;
  tokenAddress?: string;
  symbol?: string;
  name?: string;
  decimals?: number;
  balance?: string;
  claimableAmount?: string;
  estimatedTime?: Date;
}

export interface ClaimableBalances {
  address: string;
  tokens: ClaimableBalance[];
}

export interface Transaction {
  to: string;
  data: string;
  value: string;
  network: NetworkName;
  spender?: string;
  gasLimit?: string;
}

export interface NetworkProvider {
  getNetwork(): Promise<{ chainId: bigint; name: string }>;
  call(transaction: { to: string; data: string }): Promise<string>;
}

export interface ClaimParams {
  network: NetworkName;
  uuid: string | bigint;
  tokenAddress?: string;
}

export interface ClaimQuote {
  quoteId: string;
  network: NetworkName;
  uuid: string | bigint;
  token?: Token;
  estimatedGas?: string;
  tx: Transaction;
}

export interface StoredQuote {
  quote: ClaimQuote;
  expiresAt: number;
}
