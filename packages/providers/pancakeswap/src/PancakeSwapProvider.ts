import { ISwapProvider, SwapQuote, SwapResult, SwapParams } from '@binkai/swap-plugin';
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

// Constants
const GAS_BUFFER = ethers.parseEther('0.0001'); // ~0.0001 BNB for gas

interface TokenInfo {
  address: `0x${string}`;
  decimals: number;
  symbol: string;
  chainId: number;
}

export interface SwapTransaction {
  to: string;
  data: string;
  value: string;
  gasLimit: string;
}

export class PancakeSwapProvider implements ISwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  private tokenCache: Map<string, Token> = new Map();
  private viemClient: PublicClient;
  private quotes: Map<
    string,
    { quote: SwapQuote; trade: Awaited<ReturnType<typeof V4Router.getBestTrade>> | undefined }
  > = new Map();

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    this.provider = provider;
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

  // getPrompt(): string {
  //   return `If you are using PancakeSwap, You can use BNB with address ${Native.onChain(this.chainId).wrapped.address}`;
  // }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const erc20Interface = new Interface([
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ]);

    const contract = new Contract(tokenAddress, erc20Interface, this.provider);
    const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);

    return {
      address: tokenAddress.toLowerCase() as `0x${string}`,
      decimals: Number(decimals),
      symbol,
      chainId: this.chainId,
    };
  }

  private async getToken(tokenAddress: string): Promise<Token> {
    const cachedToken = this.tokenCache.get(tokenAddress);
    if (cachedToken) {
      return cachedToken;
    }

    if (tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      const token = new Token(this.chainId, tokenAddress as `0x${string}`, 18, 'BNB');
      this.tokenCache.set(tokenAddress, token);
      return token;
    }

    const info = await this.getTokenInfo(tokenAddress);
    const token = new Token(info.chainId, info.address, info.decimals, info.symbol);

    this.tokenCache.set(tokenAddress, token);
    return token;
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

  async getQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const [tokenIn, tokenOut] = await Promise.all([
        params.fromToken.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()
          ? Native.onChain(this.chainId)
          : this.getToken(params.fromToken),
        params.toToken.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()
          ? Native.onChain(this.chainId)
          : this.getToken(params.toToken),
      ]);

      // Create currency amounts
      const amountIn =
        params.type === 'input'
          ? CurrencyAmount.fromRawAmount(
              tokenIn,
              ethers.parseUnits(params.amount, tokenIn.decimals).toString(),
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

      const quote: SwapQuote = {
        quoteId,
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromTokenDecimals: tokenIn.decimals,
        toTokenDecimals: tokenOut.decimals,
        fromAmount:
          params.type === 'input'
            ? params.amount
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
      };

      // Store the quote and trade for later use
      this.quotes.set(quoteId, { quote, trade });

      // Delete quote after 5 minutes
      setTimeout(
        () => {
          this.quotes.delete(quoteId);
        },
        5 * 60 * 1000,
      );

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async buildSwapTransaction(quote: SwapQuote, userAddress: string): Promise<SwapTransaction> {
    // Get the stored quote and trade
    const storedData = this.quotes.get(quote.quoteId);
    if (!storedData) {
      throw new Error('Quote expired or not found. Please get a new quote.');
    }

    const { trade } = storedData;

    if (!trade) {
      throw new Error('Trade not found. Please get a new quote.');
    }

    try {
      const { value, calldata } = SwapRouter.swapCallParameters(trade as any, {
        recipient: userAddress as `0x${string}`,
        slippageTolerance: new Percent(Math.floor(quote.slippage * 100), 10000),
      });

      return {
        to: SMART_ROUTER_ADDRESSES[this.chainId],
        data: calldata,
        value: value.toString(),
        gasLimit: '350000', // TODO: get gas limit from trade
      };
    } catch (error: unknown) {
      console.error('Error building swap transaction:', error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  async buildApproveTransaction(
    token: string,
    spender: string,
    amount: string,
    userAddress: string,
  ): Promise<SwapTransaction> {
    const tokenInfo = await this.getToken(token);
    const erc20Interface = new Interface([
      'function approve(address spender, uint256 amount) returns (bool)',
    ]);

    const data = erc20Interface.encodeFunctionData('approve', [
      spender,
      ethers.parseUnits(amount, tokenInfo.decimals),
    ]);

    return {
      to: token,
      data,
      value: '0',
      gasLimit: '50000',
    };
  }

  async checkAllowance(token: string, owner: string, spender: string): Promise<bigint> {
    if (token.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
      return BigInt(Number.MAX_SAFE_INTEGER) * BigInt(10 ** 18);
    }
    const erc20 = new Contract(
      token,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider,
    );
    return await erc20.allowance(owner, spender);
  }

  async checkBalance(
    quote: SwapQuote,
    userAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      const tokenToCheck = quote.fromToken;
      const requiredAmount = ethers.parseUnits(quote.fromAmount, quote.fromTokenDecimals);

      // Add gas cost buffer for native token swaps
      const gasCostBuffer =
        tokenToCheck.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase() ? GAS_BUFFER : 0n;

      const formattedGasBuffer = ethers.formatEther(gasCostBuffer);

      const totalRequired = requiredAmount + gasCostBuffer;

      // Check native balance
      if (tokenToCheck.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase()) {
        const balance = await this.provider.getBalance(userAddress);

        if (balance < totalRequired) {
          const formattedBalance = ethers.formatEther(balance);
          const formattedRequired = ethers.formatEther(requiredAmount);
          const formattedTotal = ethers.formatEther(totalRequired);
          return {
            isValid: false,
            message: `Insufficient BNB balance. Required: ${formattedRequired} BNB (+ ~${formattedGasBuffer} BNB for gas = ${formattedTotal} BNB), Available: ${formattedBalance} BNB`,
          };
        }
      } else {
        // For other tokens, check ERC20 balance
        const erc20 = new Contract(
          tokenToCheck,
          [
            'function balanceOf(address) view returns (uint256)',
            'function symbol() view returns (string)',
          ],
          this.provider,
        );

        const [balance, symbol] = await Promise.all([erc20.balanceOf(userAddress), erc20.symbol()]);

        if (balance < requiredAmount) {
          const formattedBalance = ethers.formatUnits(balance, quote.fromTokenDecimals);
          const formattedRequired = ethers.formatUnits(requiredAmount, quote.fromTokenDecimals);
          return {
            isValid: false,
            message: `Insufficient ${symbol} balance. Required: ${formattedRequired} ${symbol}, Available: ${formattedBalance} ${symbol}`,
          };
        }

        // If swapping tokens (not BNB), check if user has enough BNB for gas
        const bnbBalance = await this.provider.getBalance(userAddress);
        if (bnbBalance < GAS_BUFFER) {
          const formattedBnbBalance = ethers.formatEther(bnbBalance);
          return {
            isValid: false,
            message: `Insufficient BNB for gas fees. Required: ~0.01 BNB, Available: ${formattedBnbBalance} BNB`,
          };
        }
      }

      return { isValid: true };
    } catch (error) {
      console.error('Error checking balance:', error);
      return {
        isValid: false,
        message: `Failed to check balance: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
