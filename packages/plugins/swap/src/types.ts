export interface SwapQuote {
  quoteId: string;
  fromToken: string;
  toToken: string;
  fromAmount: string;
  toAmount: string;
  fromTokenDecimals: number;
  toTokenDecimals: number;
  priceImpact: number;
  route: string[];
  estimatedGas: string;
  type: 'input' | 'output'; // Whether this is an exact input or exact output swap
  tx?: {
    to: string;
    data: string;
    value: string;
    gasLimit: string;
  };
  slippage: number;
}

export interface SwapResult extends SwapQuote {
  transactionHash: string;
  status: 'success' | 'failed';
  error?: string;
}

export interface SwapParams {
  fromToken: string;
  toToken: string;
  amount: string;
  type: 'input' | 'output'; // Whether amount is input or output
  slippage: number;
}

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
}

export interface ISwapProvider {
  /**
   * Get the name of the DEX provider
   */
  getName(): string;

  /**
   * Get supported chains for this provider
   */
  getSupportedChains(): string[];

  /**
   * Get the provider-specific prompt that helps guide the AI in using this provider effectively
   * This is optional - if not implemented, no special prompt will be used
   */
  getPrompt?(): string;

  /**
   * Check if user has sufficient balance for the swap
   * @param quote The swap quote to check balance against
   * @param userAddress The address of the user
   * @returns Promise<{ isValid: boolean; message?: string }> Returns if balance is sufficient and error message if not
   */
  checkBalance(
    quote: SwapQuote,
    userAddress: string,
  ): Promise<{ isValid: boolean; message?: string }>;

  /**
   * Get a quote for swapping tokens
   */
  getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote>;

  /**
   * Build a transaction for swapping tokens
   * @param quote The quote to execute
   * @param userAddress The address of the user who will execute the swap
   */
  buildSwapTransaction(quote: SwapQuote, userAddress: string): Promise<SwapTransaction>;

  /**
   * Build a transaction for approving token spending
   * @param token The token to approve
   * @param spender The address to approve spending for
   * @param amount The amount to approve
   * @param userAddress The address of the user who will approve
   */
  buildApproveTransaction(
    token: string,
    spender: string,
    amount: string,
    userAddress: string,
  ): Promise<SwapTransaction>;

  /**
   * Check the allowance of a token for a spender
   * @param token The token to check
   * @param owner The owner of the tokens
   * @param spender The address to check allowance for
   */
  checkAllowance(token: string, owner: string, spender: string): Promise<bigint>;
}
