import { NetworkName, Token } from '@binkai/core';

export interface StakingQuote {
  network: NetworkName;
  quoteId: string;
  tokenA: Token;
  tokenB: Token;
  amountA: string;
  amountB: string;
  currentAPY: number;
  averageAPY?: number;
  maxSupply: number;
  currentSupply: number;
  liquidity: number;
  estimatedGas: string;
  type: 'supply' | 'withdraw' | 'stake' | 'unstake';
  tx?: Transaction;
}

export interface StakingResult extends StakingQuote {
  transactionHash: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface StakingParams {
  network: NetworkName;
  tokenA: string;
  tokenB: string;
  amountA: string;
  amountB: string;
  type: 'supply' | 'withdraw' | 'stake' | 'unstake';
}

export interface Transaction {
  to: string;
  data: string;
  value: string;
  gasLimit?: bigint;
  network: NetworkName;
}

export interface IStakingProvider {
  /**
   * Get the name of the DEX provider
   */
  getName(): string;

  /**
   * Get supported networks for this provider
   */
  getSupportedNetworks(): NetworkName[];

  /**
   * Get the provider-specific prompt that helps guide the AI in using this provider effectively
   * This is optional - if not implemented, no special prompt will be used
   */
  getPrompt?(): string;

  /**
   * Check if user has sufficient balance for the staking
   * @param quote The staking quote to check balance against
   * @param userAddress The address of the user
   * @returns Promise<{ isValid: boolean; message?: string }> Returns if balance is sufficient and error message if not
   */
  checkBalance(
    quote: StakingQuote,
    userAddress: string,
  ): Promise<{ isValid: boolean; message?: string }>;

  /**
   * Get a quote for staking tokens
   */
  getQuote(params: StakingParams, userAddress: string): Promise<StakingQuote>;

  /**
   * Build a transaction for staking tokens
   * @param quote The quote to execute
   * @param userAddress The address of the user who will execute the staking
   */
  buildStakingTransaction(quote: StakingQuote, userAddress: string): Promise<Transaction>;

  /**
   * Build a transaction for approving token spending
   * @param network The network to approve
   * @param tokenAddress The address of the token to approve
   * @param spender The address to approve spending for
   * @param amount The amount to approve
   * @param walletAddress The address of the user who will approve
   */
  buildApproveTransaction(
    network: NetworkName,
    tokenAddress: string,
    spender: string,
    amount: string,
    walletAddress: string,
  ): Promise<Transaction>;

  /**
   * Check the allowance of a token for a spender
   * @param network The network to check
   * @param tokenAddress The address of the token to check
   * @param owner The owner of the tokens
   * @param spender The address to check allowance for
   */
  checkAllowance(
    network: NetworkName,
    tokenAddress: string,
    owner: string,
    spender: string,
  ): Promise<bigint>;
}
