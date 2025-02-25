import { ISwapProvider, SwapQuote, SwapResult, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';
import CryptoJS from 'crypto-js';
import { EVM_NATIVE_TOKEN_ADDRESS } from '@binkai/core';
import { BaseSwapProvider } from '@binkai/swap-plugin';

// Enhanced interface with better type safety
interface TokenInfo extends Token {
  // Inherits all Token properties and maintains DRY principle
}

// Constants for better maintainability
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  // BNB_ADDRESS: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
  // OKX_BNB_ADDRESS: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  OKX_APPROVE_ADDRESS: '0x2c34A2Fb1d0b4f55de51E1d0bDEfaDDce6b7cDD6',
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

export class OkxProvider extends BaseSwapProvider {
  private chainId: ChainId;

  private readonly apiKey: string;
  private readonly secretKey: string;
  private readonly passphrase: string;
  private readonly projectId: string;

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    super(provider);
    this.provider = provider;
    this.chainId = chainId;
    this.apiKey = process.env.OKX_API_KEY || '';
    this.secretKey = process.env.OKX_SECRET_KEY || '';
    this.passphrase = process.env.OKX_PASSPHRASE || '';
    this.projectId = process.env.OKX_PROJECT || '';
  }
  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  getName(): string {
    return 'okx';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }

  /**
   * Generates OKX API signature and headers
   * @param path API endpoint path
   * @param timestamp ISO timestamp
   * @returns Headers for OKX API request
   */
  private generateApiHeaders(path: string, timestamp: string): HeadersInit {
    const signature = CryptoJS.enc.Base64.stringify(
      CryptoJS.HmacSHA256(timestamp + 'GET' + path, this.secretKey),
    );

    return {
      'OK-ACCESS-KEY': this.apiKey,
      'OK-ACCESS-SIGN': signature,
      'OK-ACCESS-TIMESTAMP': timestamp,
      'OK-ACCESS-PASSPHRASE': this.passphrase,
      'OK-ACCESS-PROJECT': this.projectId,
    };
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      if (params.type === 'output') {
        throw new Error('OKX does not support output swaps');
      }

      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken),
        this.getToken(params.toToken),
      ]);

      const amountIn =
        params.type === 'input'
          ? Math.floor(Number(params.amount) * 10 ** tokenIn.decimals)
          : Math.floor(Number(params.amount) * 10 ** tokenOut.decimals);

      const now = new Date();

      const isoString = now.toISOString();

      const slippageOKX = Number(params.slippage) / 100 || 0.1;

      const path = `/api/v5/dex/aggregator/swap?amount=${amountIn}&chainId=${this.chainId}&fromTokenAddress=${tokenIn.address}&toTokenAddress=${tokenOut.address}&slippage=${slippageOKX}&userWalletAddress=${userAddress}`;

      console.log('🤖 OKX Path', path);

      const headers = this.generateApiHeaders(path, isoString);

      const response = await fetch(`https://www.okx.com${path}`, {
        method: 'GET',
        headers,
      });

      const data = await response.json();
      if (!data.data || data.data.length === 0) {
        throw new Error('No data returned from OKX');
      }

      const inputAmount = data.data[0].routerResult.fromTokenAmount;
      const outputAmount = data.data[0].routerResult.toTokenAmount;
      const estimatedGas = data.data[0].routerResult.estimatedGas;
      const priceImpact = Number(data.data[0].routerResult.priceImpactPercentage);
      const tx = data.data[0].tx;

      // Generate a unique quote ID
      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: SwapQuote = {
        quoteId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromTokenDecimals: tokenIn.decimals,
        toTokenDecimals: tokenOut.decimals,
        slippage: params.slippage,
        fromAmount: ethers.formatUnits(inputAmount.toString(), tokenIn.decimals),
        toAmount: ethers.formatUnits(outputAmount.toString(), tokenOut.decimals),
        priceImpact,
        route: ['okx'],
        estimatedGas: estimatedGas,
        type: params.type,
        tx: {
          to: tx?.to || '',
          data: tx?.data || '',
          value: tx?.value || '0',
          gasLimit: (tx.gas * 1.5).toString() || '350000',
        },
      };
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
