export interface BridgeConfig {
  fromChain: string;
  toChain: string;
  tokenAddress: string;
  amount: string;
  recipient?: string;
}

export interface BridgeQuote {
  fromToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  toToken: {
    address: string;
    symbol: string;
    decimals: number;
  };
  fromAmount: string;
  toAmount: string;
  estimatedGas: string;
  bridgeFee: string;
  provider: string;
}

export interface BridgeTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit?: string;
}

export interface BridgeProvider {
  getName(): string;
  getQuote(config: BridgeConfig): Promise<BridgeQuote>;
  buildBridgeTransaction(quote: BridgeQuote): Promise<BridgeTransaction>;
  buildApproveTransaction(
    token: string,
    spender: string,
    amount: string,
    userAddress: string,
  ): Promise<BridgeTransaction>;
  checkAllowance(token: string, owner: string, spender: string): Promise<bigint>;
  getSupportedChains(): string[];
}
