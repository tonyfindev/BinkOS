import { ISwapProvider, SwapQuote, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { EVM_NATIVE_TOKEN_ADDRESS } from '@binkai/core';
import { BaseSwapProvider } from '@binkai/swap-plugin';
// Enhanced interface with better type safety
interface TokenInfo extends Token {
  // Inherits all Token properties and maintains DRY principle
}

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  OKU_BNB_ADDRESS: '0x0000000000000000000000000000000000000000',
  OKU_API_PATH: 'https://canoe.v2.icarus.tools/market/zeroex/swap_quote',
} as const;

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
}

export interface Token {
  address: `0x${string}`;
  decimals: number;
  symbol: string;
  chainId: number;
}

enum ChainId {
  BSC = 56,
  ETH = 1,
}

export class OkuProvider extends BaseSwapProvider {
  private chainId: ChainId;

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    super(provider);
    this.provider = provider;
    this.chainId = chainId;
  }

  getName(): string {
    return 'oku';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }
  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      if (params.type === 'output') {
        throw new Error('OKU does not support output swaps');
      }

      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken),
        this.getToken(params.toToken),
      ]);

      const tokenInAddress =
        tokenIn.address === CONSTANTS.BNB_ADDRESS ? CONSTANTS.OKU_BNB_ADDRESS : tokenIn.address;

      const slippageOKU = Number(params.slippage) * 100 || 0.1;
      const headers = {
        'Content-Type': 'application/json',
      };
      const body = JSON.stringify({
        chain: 'bsc',
        account: userAddress,
        inTokenAddress: tokenInAddress,
        outTokenAddress: tokenOut.address,
        isExactIn: true,
        slippage: slippageOKU,
        inTokenAmount: params.amount,
      });
      const response = await fetch(CONSTANTS.OKU_API_PATH, {
        method: 'POST',
        headers,
        body,
      });

      const data = await response.json();
      console.log('Response:', data);
      if (!data || data.length === 0) {
        throw new Error('No data returned from OKU');
      }

      const inputAmount = data.inAmount;
      const outputAmount = data.outAmount;
      const estimatedGas = data.fees.gas;
      const priceImpact = 0;
      const tx = data.coupon.raw.quote.transaction;

      // Generate a unique quote ID
      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: SwapQuote = {
        quoteId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromTokenDecimals: tokenIn.decimals,
        toTokenDecimals: tokenOut.decimals,
        slippage: params.slippage,
        fromAmount: inputAmount,
        toAmount: outputAmount,
        priceImpact,
        route: ['oku'],
        estimatedGas: estimatedGas,
        type: params.type,
        tx: {
          to: tx?.to || '',
          data: tx?.data || '',
          value: tx?.value || '0',
          gasLimit: (tx.gas * 1.5).toString() || '350000',
        },
      };
      console.log('log', quote);
      // Store the quote and trade for later use
      this.quotes.set(quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

      // Delete quote after 5 minutes
      setTimeout(() => {
        this.quotes.delete(quoteId);
      }, CONSTANTS.QUOTE_EXPIRY);

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async buildSwapTransaction(quote: SwapQuote, userAddress: string): Promise<SwapTransaction> {
    try {
      // Get the stored quote and trade
      const storedData = this.quotes.get(quote.quoteId);

      if (!storedData) {
        throw new Error('Quote expired or not found. Please get a new quote.');
      }

      return {
        to: storedData?.quote.tx?.to || '',
        data: storedData?.quote?.tx?.data || '',
        value: storedData?.quote?.tx?.value || '0',
        gasLimit: '350000',
      };
    } catch (error: unknown) {
      console.error('Error building swap transaction:', error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
