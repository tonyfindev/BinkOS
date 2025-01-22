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
import { SmartRouter, SMART_ROUTER_ADDRESSES, SwapRouter, V2Pool, V3Pool } from '@pancakeswap/smart-router';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { GraphQLClient } from 'graphql-request';
import { createPublicClient, http, PublicClient, Chain, defineChain } from 'viem';

// Define BSC chain for viem
const bsc = defineChain({
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: {
    decimals: 18,
    name: 'BNB',
    symbol: 'BNB',
  },
  rpcUrls: {
    default: { http: ['https://bsc-dataseed1.binance.org'] },
    public: { http: ['https://bsc-dataseed1.binance.org'] },
  },
  blockExplorers: {
    default: { name: 'BscScan', url: 'https://bscscan.com' },
  },
  contracts: {
    multicall3: {
      address: '0xcA11bde05977b3631167028862bE2a173976CA11',
      blockCreated: 15921452,
    },
  },
});

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

// Simple provider interface that matches what PancakeSwap expects
interface SimpleProvider {
  getGasPrice(): Promise<bigint>;
  multicall(args: { address: string; abi: any[]; calls: any[] }): Promise<any[]>;
}

export class PancakeSwapProvider implements ISwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  private tokenCache: Map<string, Token> = new Map();
  private quoteProvider: any;
  private v3SubgraphClient: GraphQLClient;
  private v2SubgraphClient: GraphQLClient;
  private viemClient: PublicClient;
  private simpleProvider: SimpleProvider;

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

    // Create a simple provider that wraps the viem client
    this.simpleProvider = {
      getGasPrice: async () => this.viemClient.getGasPrice(),
      multicall: async (args) => {
        const contract = new Contract(args.address, args.abi, this.provider);
        return Promise.all(args.calls.map(call => 
          contract[call.functionName](...call.args)
        ));
      }
    };

    // Initialize subgraph clients
    this.v3SubgraphClient = new GraphQLClient('https://api.thegraph.com/subgraphs/name/pancakeswap/exchange-v3-bsc');
    this.v2SubgraphClient = new GraphQLClient('https://proxy-worker-api.pancakeswap.com/bsc-exchange');

    // Initialize quote provider with simple provider
    this.quoteProvider = SmartRouter.createQuoteProvider({
      onChainProvider: () => this.simpleProvider as any
    });
  }

  getName(): string {
    return 'pancakeswap';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }

  private async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    const erc20Interface = new Interface([
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ]);

    const contract = new Contract(tokenAddress, erc20Interface, this.provider);
    const [decimals, symbol] = await Promise.all([
      contract.decimals(),
      contract.symbol(),
    ]);

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

    const info = await this.getTokenInfo(tokenAddress);
    console.log('🤖 Token info:', info);
    const token = new Token(
      info.chainId,
      info.address,
      info.decimals,
      info.symbol
    );

    this.tokenCache.set(tokenAddress, token);
    return token;
  }

  private async getCandidatePools(tokenIn: Token, tokenOut: Token) {
    let v2Pools: V2Pool[] = [];
    let v3Pools: V3Pool[] = [];

    try {
      v2Pools = await SmartRouter.getV2CandidatePools({
        onChainProvider: () => this.simpleProvider as any,
        v2SubgraphProvider: () => this.v2SubgraphClient,
        v3SubgraphProvider: () => this.v3SubgraphClient,
        currencyA: tokenIn,
        currencyB: tokenOut,
      });
      console.log('✓ V2 pools fetched:', v2Pools.length);
    } catch (error) {
      console.warn('Failed to fetch V2 pools:', error);
    }

    try {
      v3Pools = await SmartRouter.getV3CandidatePools({
        onChainProvider: () => this.simpleProvider as any,
        subgraphProvider: () => this.v3SubgraphClient,
        currencyA: tokenIn,
        currencyB: tokenOut,
      });
    } catch (error) {
      console.warn('Failed to fetch V3 pools:', error);
    }

    const pools = [...v2Pools, ...v3Pools];
    if (pools.length === 0) {
      throw new Error('No liquidity pools found for the token pair');
    }

    return pools;
  }

  async getQuote(params: SwapParams): Promise<SwapQuote> {
    try {
      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken),
        this.getToken(params.toToken),
      ]);

      // Create currency amounts
      const amountIn = params.type === 'input'
        ? CurrencyAmount.fromRawAmount(tokenIn, ethers.parseUnits(params.amount, tokenIn.decimals).toString())
        : undefined;
      const amountOut = params.type === 'output'
        ? CurrencyAmount.fromRawAmount(tokenOut, ethers.parseUnits(params.amount, tokenOut.decimals).toString())
        : undefined;

      // Get candidate pools
      const pools = await this.getCandidatePools(tokenIn, tokenOut);
      console.log('🤖 Pools:', pools.length);
      // Get the best trade using Smart Router
      const trade = params.type === 'input' && amountIn
        ? await SmartRouter.getBestTrade(
            amountIn,
            tokenOut,
            TradeType.EXACT_INPUT,
            {
              gasPriceWei: () => this.simpleProvider.getGasPrice(),
              maxHops: 3,
              maxSplits: 3,
              poolProvider: SmartRouter.createStaticPoolProvider(pools),
              quoteProvider: this.quoteProvider,
              quoterOptimization: true,
            }
          )
        : amountOut
          ? await SmartRouter.getBestTrade(
              amountOut,
              tokenIn,
              TradeType.EXACT_OUTPUT,
              {
                gasPriceWei: () => this.simpleProvider.getGasPrice(),
                maxHops: 3,
                maxSplits: 3,
                poolProvider: SmartRouter.createStaticPoolProvider(pools),
                quoteProvider: this.quoteProvider,
                quoterOptimization: true,
              }
            )
          : null;

      if (!trade) {
        throw new Error('No route found');
      }

      // Calculate output amounts based on trade type
      const slippageTolerance = new Percent(Math.floor(params.slippage * 100), 10000);
      const { inputAmount, outputAmount } = trade;

      return {
        fromToken: params.fromToken,
        toToken: params.toToken,
        fromAmount: params.type === 'input'
          ? params.amount
          : ethers.formatUnits(inputAmount.quotient.toString(), tokenIn.decimals),
        toAmount: params.type === 'output'
          ? params.amount
          : ethers.formatUnits(outputAmount.quotient.toString(), tokenOut.decimals),
        priceImpact: Number((trade as any).priceImpact?.toSignificant(2) || 0),
        route: trade.routes.map(route => (route as any).path[0].address),
        estimatedGas: '350000',
        type: params.type,
      };
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(`Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async buildSwapTransaction(quote: SwapQuote, userAddress: string): Promise<SwapTransaction> {
    try {
      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(quote.fromToken),
        this.getToken(quote.toToken),
      ]);

      // Get trade data
      const trade = await this.recreateTrade(quote, tokenIn, tokenOut);
      
      // Get swap parameters
      const { value, calldata } = SwapRouter.swapCallParameters(trade, {
        recipient: userAddress as `0x${string}`,
        slippageTolerance: new Percent(Math.floor(0.5 * 100), 10000), // 0.5% slippage
      });

      return {
        to: SMART_ROUTER_ADDRESSES[this.chainId] as string,
        data: calldata,
        value: value.toString(),
        gasLimit: '350000',
      };
    } catch (error: unknown) {
      console.error('Error building swap transaction:', error);
      throw new Error(`Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async buildApproveTransaction(token: string, spender: string, amount: string, userAddress: string): Promise<SwapTransaction> {
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
    const erc20 = new Contract(
      token,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider
    );
    return await erc20.allowance(owner, spender);
  }

  private async recreateTrade(quote: SwapQuote, tokenIn: Token, tokenOut: Token): Promise<any> {
    const amountIn = quote.type === 'input'
      ? CurrencyAmount.fromRawAmount(tokenIn, ethers.parseUnits(quote.fromAmount, tokenIn.decimals).toString())
      : undefined;
    const amountOut = quote.type === 'output'
      ? CurrencyAmount.fromRawAmount(tokenOut, ethers.parseUnits(quote.toAmount, tokenOut.decimals).toString())
      : undefined;

    // Get candidate pools
    const pools = await this.getCandidatePools(tokenIn, tokenOut);

    const trade = quote.type === 'input' && amountIn
      ? await SmartRouter.getBestTrade(
          amountIn,
          tokenOut,
          TradeType.EXACT_INPUT,
          {
            gasPriceWei: () => this.simpleProvider.getGasPrice(),
            maxHops: 3,
            maxSplits: 3,
            poolProvider: SmartRouter.createStaticPoolProvider(pools),
            quoteProvider: this.quoteProvider,
            quoterOptimization: true,
          }
        )
      : amountOut
        ? await SmartRouter.getBestTrade(
            amountOut,
            tokenIn,
            TradeType.EXACT_OUTPUT,
            {
              gasPriceWei: () => this.simpleProvider.getGasPrice(),
              maxHops: 3,
              maxSplits: 3,
              poolProvider: SmartRouter.createStaticPoolProvider(pools),
              quoteProvider: this.quoteProvider,
              quoterOptimization: true,
            }
          )
        : null;

    if (!trade) {
      throw new Error('Failed to recreate trade route');
    }

    return trade;
  }
} 