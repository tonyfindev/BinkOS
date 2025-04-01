import {
  BaseSwapProvider,
  NetworkProvider,
  parseTokenAmount,
  SwapParams,
  SwapQuote,
} from '@binkai/swap-plugin';
import {
  NetworkName,
  SOL_NATIVE_TOKEN_ADDRESS,
  SOL_NATIVE_TOKEN_ADDRESS2,
  Token,
} from '@binkai/core';

import axios, { AxiosInstance, AxiosError } from 'axios';
import { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import {
  JupiterError,
  JupiterQuoteParams,
  JupiterQuoteResponse,
  JupiterResponse,
  JupiterSwapParams,
  JupiterSwapResponse,
} from './utils';
import { Provider, ethers, Contract, Interface } from 'ethers';
const DEFAULT_SOLANA_RPC_URL = 'https://api.mainnet-beta.solana.com';

export class JupiterProvider extends BaseSwapProvider {
  private api: AxiosInstance;
  private static readonly DEFAULT_BASE_URL = 'https://quote-proxy.jup.ag';
  private static readonly BASE_URL_JUPITER = 'https://api.jup.ag';
  private provider: Connection;
  constructor(provider: Connection) {
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.SOLANA, new Connection(DEFAULT_SOLANA_RPC_URL));
    super(providerMap);
    this.api = axios.create({
      baseURL: JupiterProvider.DEFAULT_BASE_URL,
      headers: {
        Accept: 'application/json',
      },
    });
    this.provider = new Connection(DEFAULT_SOLANA_RPC_URL);
  }

  getName(): string {
    return 'jupiter';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.SOLANA];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === SOL_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: 'So11111111111111111111111111111111111111112', // hardcoded solana native token address
        decimals: 9,
        symbol: 'SOL',
      };
    }

    const token = await super.getToken(tokenAddress, network);

    const tokenInfo = {
      chainId: 'solana',
      address: token.address,
      decimals: token.decimals,
      symbol: token.symbol,
    };
    return tokenInfo;
  }

  private handleError(error: unknown): JupiterError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError<JupiterError>;
      return {
        error: axiosError.response?.data?.error || axiosError.message,
        message: axiosError.response?.data?.message,
        code: axiosError.response?.status,
      };
    }
    return {
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    };
  }

  checkHaveNativeToken(params: any): boolean {
    if (
      params?.inputMint === SOL_NATIVE_TOKEN_ADDRESS2 ||
      params?.outputMint === SOL_NATIVE_TOKEN_ADDRESS2
    ) {
      return true;
    }
    return false;
  }

  async getSwapBuyAggregator(params: any, userPublicKey: string): Promise<JupiterSwapResponse> {
    try {
      const response = await this.api.post<JupiterSwapResponse>('/swap?swapType=aggregator', {
        addConsensusAccount: false,
        allowOptimizedWrappedSolTokenAccount: true,
        asLegacyTransaction: false,
        correctLastValidBlockHeight: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          priorityLevelWithMaxLamports: {
            global: false,
            maxLamports: 1400000,
            priorityLevel: 'veryHigh',
          },
        },
        quoteResponse: params,
        userPublicKey: userPublicKey,
        wrapAndUnwrapSol: true,
      });
      const data = response?.data;
      const latestBlockhash = await this.provider.getLatestBlockhash('confirmed');
      data.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      return data;
    } catch (error) {
      throw new Error('Failed to get swap buy aggregator');
    }
  }

  async getSwapTransactions(params: any): Promise<JupiterResponse<JupiterSwapResponse>> {
    try {
      const response = await this.api.post<JupiterSwapResponse>('/swap', {
        quoteResponse: params.quoteResponse,
        userPublicKey: params.userPublicKey,
        wrapUnwrapSol: params.wrapUnwrapSol,
        useSharedAccounts: params.useSharedAccounts,
        feeAccount: params.feeAccount,
        trackingAccount: params.trackingAccount,
        computeUnitPriceMicroLamports: params.computeUnitPriceMicroLamports,
        prioritizationFeeLamports: params.prioritizationFeeLamports,
        asLegacyTransaction: params.asLegacyTransaction,
        useTokenLedger: params.useTokenLedger,
        destinationTokenAccount: params.destinationTokenAccount,
        dynamicComputeUnitLimit: params.dynamicComputeUnitLimit,
        skipUserAccountsRpcCalls: params.skipUserAccountsRpcCalls,
        dynamicSlippage: params.dynamicSlippage,
      });

      return response.data;
    } catch (error) {
      return this.handleError(error);
    }
  }

  private async cancelOrder(orderId: string | string[], userAddress?: string) {
    const url = `${JupiterProvider.BASE_URL_JUPITER}/trigger/v1/cancelOrders`;

    const headers = {
      accept: 'application/json',
      'content-type': 'application/json', // Important for POST requests with a body
      // Include other headers if necessary (see previous response for guidance)
    };
    const request = {
      maker: userAddress,
      orderIds: [orderId],
    };

    try {
      const response = await fetch(url, {
        method: 'POST', // Note the method is now POST
        headers: headers,
        body: JSON.stringify(request), // Convert the request object to JSON
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      const latestBlockhash = await this.provider.getLatestBlockhash('confirmed');
      return {
        tx: data.transactions[0],
        to: userAddress,
        lastValidBlockHeight: latestBlockhash.lastValidBlockHeight,
      };
    } catch (error) {
      console.error('Error canceling trigger orders:', error);
      throw error;
    }
  }

  async getCreateLimitOrder(params: JupiterQuoteResponse, userAddress: string, limitPrice: string) {
    try {
      const createOrderResponse = await (
        await fetch(`${JupiterProvider.BASE_URL_JUPITER}/trigger/v1/createOrder`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            computeUnitPrice: 'auto',
            inputMint: params.inputMint.toString(),
            outputMint: params.outputMint.toString(),
            maker: userAddress,
            payer: userAddress,
            params: {
              makingAmount: params.inAmount,
              takingAmount: limitPrice,
            },
          }),
        })
      ).json();
      if (createOrderResponse.error) {
        throw new Error(createOrderResponse.error);
      }
      const latestBlockhash = await this.provider.getLatestBlockhash('confirmed');
      createOrderResponse.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;

      return createOrderResponse;
    } catch (error) {
      return this.handleError(error);
    }
  }

  public async getAllOrderIds(userAddress: string) {
    try {
      const page = 1;
      const orderStatus = 'active';
      const includeFailedTx = false;
      const url = `${JupiterProvider.BASE_URL_JUPITER}/trigger/v1/getTriggerOrders?user=${userAddress}&page=${page}&orderStatus=${orderStatus}&includeFailedTx=${includeFailedTx}`;

      const headers = {
        accept: 'application/json',
      };

      const response = await fetch(url, {
        method: 'GET',
        headers: headers,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      return data?.orders;
    } catch (error) {
      return this.handleError(error);
    }
  }

  async getQuoteJupiter(
    params: JupiterQuoteParams,
    userAddress: string,
  ): Promise<JupiterQuoteResponse> {
    try {
      const queryParams = {
        inputMint: params.inputMint.toString(),
        outputMint: params.outputMint.toString(),
        amount: params.amount,
        ...(params.slippageBps !== undefined && { slippageBps: params.slippageBps }),
        ...(params.swapMode && { swapMode: params.swapMode }),
        ...(params.dexes?.length && { dexes: params.dexes.join(',') }),
        ...(params.excludeDexes?.length && { excludeDexes: params.excludeDexes.join(',') }),
        ...(params.restrictIntermediateTokens !== undefined && {
          restrictIntermediateTokens: params.restrictIntermediateTokens,
        }),
        ...(params.onlyDirectRoutes !== undefined && { onlyDirectRoutes: params.onlyDirectRoutes }),
        ...(params.asLegacyTransaction !== undefined && {
          asLegacyTransaction: params.asLegacyTransaction,
        }),
        ...(params.platformFeeBps !== undefined && { platformFeeBps: params.platformFeeBps }),
        ...(params.maxAccounts !== undefined && { maxAccounts: params.maxAccounts }),
        ...(params.autoSlippage !== undefined && { autoSlippage: params.autoSlippage }),
        ...(params.maxAutoSlippageBps !== undefined && {
          maxAutoSlippageBps: params.maxAutoSlippageBps,
        }),
        ...(params.autoSlippageCollisionUsdValue !== undefined && {
          autoSlippageCollisionUsdValue: params.autoSlippageCollisionUsdValue,
        }),
      };

      const response = await this.api.get<JupiterQuoteResponse>('/quote', {
        params: queryParams,
      });

      return response.data;
    } catch (error) {
      throw new Error('Failed to get quote');
    }
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      // check is valid limit order
      if (params?.limitPrice) {
        throw new Error('Jupiter does not support limit order for native token swaps');
      }

      const [sourceToken, destinationToken] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);

      let adjustedAmount = params.amount;
      if (params.type === 'input') {
        adjustedAmount = await this.adjustAmount(
          params.fromToken,
          params.amount,
          userAddress,
          params.network,
        );

        if (adjustedAmount !== params.amount) {
          console.log(
            `🤖 Jupiter adjusted input amount from ${params.amount} to ${adjustedAmount}`,
          );
        }
      }

      let swapData;
      let getSwapBuyAggregator;

      if (params?.limitPrice) {
        swapData = await this.getQuoteJupiter(
          {
            inputMint: new PublicKey(sourceToken.address),
            outputMint: new PublicKey(destinationToken.address),
            amount: Number(parseTokenAmount(adjustedAmount, sourceToken.decimals)),
          },
          userAddress,
        );

        const limitPrice = parseTokenAmount(
          params?.limitPrice.toString(),
          destinationToken.decimals,
        ).toString();

        getSwapBuyAggregator = await this.getCreateLimitOrder(swapData, userAddress, limitPrice);
      } else {
        swapData = await this.getQuoteJupiter(
          {
            inputMint: new PublicKey(sourceToken.address),
            outputMint: new PublicKey(destinationToken.address),
            amount: Number(parseTokenAmount(adjustedAmount, sourceToken.decimals)),
          },
          userAddress,
        );

        // build transaction
        getSwapBuyAggregator = await this.getSwapBuyAggregator(swapData, userAddress);
      }

      if (!getSwapBuyAggregator) {
        throw new Error('Failed to get swap buy aggregator');
      }

      // if (!getSwapBuyAggregator?.lastValidBlockHeight) {
      //   const latestBlockhash = await this.provider.getLatestBlockhash('confirmed');
      //   getSwapBuyAggregator.lastValidBlockHeight = latestBlockhash.lastValidBlockHeight;
      // }

      const quoteId = ethers.hexlify(ethers.randomBytes(32));
      const quote: SwapQuote = {
        quoteId: quoteId,
        fromToken: sourceToken,
        toToken: destinationToken,
        fromAmount: adjustedAmount,
        toAmount: ethers.formatUnits(swapData.outAmount, destinationToken.decimals),
        priceImpact: 0,
        route: [],
        estimatedGas: '',
        type: params.type,
        slippage: params.slippage,
        network: params.network,
        tx: {
          to: userAddress,
          spender: userAddress,
          data: params?.limitPrice
            ? getSwapBuyAggregator?.transaction
            : getSwapBuyAggregator?.swapTransaction,
          lastValidBlockHeight: getSwapBuyAggregator?.lastValidBlockHeight,
          value: parseTokenAmount(adjustedAmount, sourceToken.decimals).toString(),
          network: params.network,
        },
      };
      this.storeQuote(quote);
      return quote;
    } catch (error: unknown) {
      //console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
