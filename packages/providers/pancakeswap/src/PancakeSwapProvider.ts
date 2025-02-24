import { ISwapProvider, SwapQuote, SwapParams } from '@binkai/swap-plugin';
import { BaseSwapProvider } from '@binkai/swap-plugin';
import {
  ChainId,
  Token,
  CurrencyAmount,
  TradeType,
  Percent,
  Currency,
  Native,
} from '@pancakeswap/sdk';
import { EVM_NATIVE_TOKEN_ADDRESS } from '@binkai/core';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { createPublicClient, http, PublicClient } from 'viem';
import { bsc } from 'viem/chains';
import { SMART_ROUTER_ADDRESSES, SwapRouter, V4Router } from '@pancakeswap/smart-router';

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
}

export class PancakeSwapProvider extends BaseSwapProvider {
  private viemClient: PublicClient;
  private chainId: ChainId;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    super(provider);
    this.chainId = chainId;

    // Initialize viem client
    this.viemClient = createPublicClient({
      chain: bsc,
      transport: http('https://bsc-dataseed1.binance.org'),
      batch: {
        multicall: {
          batchSize: 1024 * 200,
        },
      },
    });
  }

  getName(): string {
    return 'pancakeswap';
  }

  getSupportedChains(): string[] {
    return ['bnb'];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string): Promise<Token> {
    const token = await super.getToken(tokenAddress);
    return new Token(this.chainId, token.address, token.decimals, token.symbol);
  }

  private async getCandidatePools(tokenIn: Currency, tokenOut: Currency) {
    try {
      const v3Pools = await V4Router.getV3CandidatePools({
        clientProvider: () => this.viemClient,
        currencyA: tokenIn,
        currencyB: tokenOut,
      });
      return v3Pools;
    } catch (error) {
      console.warn('Failed to fetch V3 pools:', error);
      throw new Error('No liquidity pools found for the token pair');
    }
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      const [tokenIn, tokenOut] = await Promise.all([
        params.fromToken.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()
          ? Native.onChain(this.chainId)
          : this.getToken(params.fromToken),
        params.toToken.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()
          ? Native.onChain(this.chainId)
          : this.getToken(params.toToken),
      ]);

      // If input token is native token and it's an exact input swap
      let adjustedAmount = params.amount;
      if (params.type === 'input' && this.isNativeToken(params.fromToken)) {
        adjustedAmount = await this.adjustNativeTokenAmount(
          params.amount,
          tokenIn.decimals,
          userAddress,
        );
      }

      // Create currency amounts
      const amountIn =
        params.type === 'input'
          ? CurrencyAmount.fromRawAmount(
              tokenIn,
              ethers.parseUnits(adjustedAmount, tokenIn.decimals).toString(),
            )
          : undefined;
      const amountOut =
        params.type === 'output'
          ? CurrencyAmount.fromRawAmount(
              tokenOut,
              ethers.parseUnits(params.amount, tokenOut.decimals).toString(),
            )
          : undefined;

      // Get candidate pools
      const pools = await this.getCandidatePools(tokenIn, tokenOut);

      console.log('🤖 Pools:', pools.length);

      // Get the best trade using V4Router
      const trade =
        params.type === 'input' && amountIn
          ? await V4Router.getBestTrade(amountIn, tokenOut, TradeType.EXACT_INPUT, {
              gasPriceWei: () => this.viemClient.getGasPrice(),
              candidatePools: pools,
            })
          : amountOut
            ? await V4Router.getBestTrade(amountOut, tokenIn, TradeType.EXACT_OUTPUT, {
                gasPriceWei: () => this.viemClient.getGasPrice(),
                candidatePools: pools,
              })
            : null;

      if (!trade) {
        throw new Error('No route found');
      }

      // Calculate output amounts based on trade type
      const { inputAmount, outputAmount } = trade;

      // Generate a unique quote ID
      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const { value, calldata } = SwapRouter.swapCallParameters(trade as any, {
        recipient: userAddress as `0x${string}`,
        slippageTolerance: new Percent(Math.floor(params.slippage * 100), 10000),
      });

      const quote: SwapQuote = {
        quoteId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromTokenDecimals: tokenIn.decimals,
        toTokenDecimals: tokenOut.decimals,
        fromAmount:
          params.type === 'input'
            ? adjustedAmount
            : ethers.formatUnits(inputAmount.quotient.toString(), tokenIn.decimals),
        toAmount:
          params.type === 'output'
            ? params.amount
            : ethers.formatUnits(outputAmount.quotient.toString(), tokenOut.decimals),
        priceImpact: Number((trade as any).priceImpact?.toSignificant(2) || 0),
        route: trade.routes.map(route => (route as any).path[0].address),
        estimatedGas: '350000', // TODO: get gas limit from trade
        type: params.type,
        slippage: params.slippage,
        tx: {
          to: SMART_ROUTER_ADDRESSES[this.chainId as keyof typeof SMART_ROUTER_ADDRESSES],
          data: calldata,
          value: value.toString(),
          gasLimit: '350000', // TODO: get gas limit from trade
        },
      };

      // Store the quote and trade for later use
      this.storeQuote(quote, { trade });

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
