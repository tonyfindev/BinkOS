import { SwapQuote, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Provider } from 'ethers';
import { TokenManagerHelper2ABI } from './abis/TokenManagerHelper2';
import { BaseSwapProvider, NetworkProvider } from '@binkai/swap-plugin';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

// Constants for better maintainability
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  FOUR_MEME_FACTORY_V3: '0xF251F83e40a78868FcfA3FA4599Dad6494E46034',
  FOUR_MEME_FACTORY_V2: '0x5c952063c7fc8610FFDB798152D69F0B9550762b',
  BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  FOUR_MEME_API_BASE: 'https://four.meme/meme-api/v1',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

// Add this interface for the create token parameters
interface CreateTokenParams {
  name: string;
  symbol: string;
  description: string;
  totalSupply?: number;
  raisedAmount?: number;
  saleRate?: number;
  network?: NetworkName;
}

// Add these interfaces for API responses
interface NonceResponse {
  code: number;
  msg: string;
  data: string;
}

interface CreateMemeResponse {
  code: number;
  msg: string;
  data: {
    tokenId: number;
    createArg: string;
    signature: string;
    // ... other fields
  };
}

export class FourMemeProvider extends BaseSwapProvider {
  private chainId: ChainId;
  private factory: any;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);

    super(providerMap);
    this.chainId = chainId;
    this.factory = new Contract(CONSTANTS.FOUR_MEME_FACTORY_V2, TokenManagerHelper2ABI, provider);
  }

  getName(): string {
    return 'four-meme';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB];
  }

  protected isNativeToken(tokenAddress: string): boolean {
    return tokenAddress.toLowerCase() === EVM_NATIVE_TOKEN_ADDRESS.toLowerCase();
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    if (this.isNativeToken(tokenAddress)) {
      return {
        address: tokenAddress as `0x${string}`,
        decimals: 18,
        symbol: 'BNB',
      };
    }

    const token = await super.getToken(tokenAddress, network);

    const tokenInfo = {
      chainId: this.chainId,
      address: token.address.toLowerCase() as `0x${string}`,
      decimals: token.decimals,
      symbol: token.symbol,
    };
    return tokenInfo;
  }

  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken, params.network),
        this.getToken(params.toToken, params.network),
      ]);
      let adjustedAmount = params.amount;
      if (params.type === 'input') {
        // Use the adjustAmount method for all tokens (both native and ERC20)
        adjustedAmount = await this.adjustAmount(
          params.fromToken,
          params.amount,
          userAddress,
          params.network,
        );

        if (adjustedAmount !== params.amount) {
          console.log(
            `🤖 FourMeme adjusted input amount from ${params.amount} to ${adjustedAmount}`,
          );
        }
      }
      const amountIn =
        params.type === 'input'
          ? ethers.parseUnits(adjustedAmount, tokenIn.decimals)
          : ethers.parseUnits(adjustedAmount, tokenOut.decimals);

      const needToken =
        tokenIn.address.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
          ? tokenOut.address
          : tokenIn.address;

      // Get token info from contract and convert to proper format
      const rawTokenInfo = await this.factory._tokenInfos(needToken);

      if (Number(rawTokenInfo.status) !== 0) {
        throw new Error('Token is not launched');
      }

      const tokenInfo = {
        base: rawTokenInfo.base,
        quote: rawTokenInfo.quote,
        template: rawTokenInfo.template,
        totalSupply: rawTokenInfo.totalSupply,
        maxOffers: rawTokenInfo.maxOffers,
        maxRaising: rawTokenInfo.maxRaising,
        launchTime: rawTokenInfo.launchTime,
        offers: rawTokenInfo.offers,
        funds: rawTokenInfo.funds,
        lastPrice: rawTokenInfo.lastPrice,
        K: rawTokenInfo.K,
        T: rawTokenInfo.T,
        status: rawTokenInfo.status,
      };

      let txData;
      let value = '0';
      let estimatedAmount = '0';
      let estimatedCost = '0';

      if (
        params.type === 'input' &&
        params.fromToken.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
      ) {
        // Calculate estimated output amount using calcBuyAmount
        const estimatedTokens = await this.factory.calcBuyAmount(tokenInfo, amountIn || 0n);
        estimatedAmount = estimatedTokens.toString();

        // Use the specific function signature for buyTokenAMAP with 3 parameters
        txData = this.factory.interface.encodeFunctionData(
          'buyTokenAMAP(address,uint256,uint256)',
          [
            params.toToken, // token to buy
            amountIn || 0n, // funds to spend
            0n, // minAmount (set to 0 for now - could add slippage protection)
          ],
        );
        value = amountIn?.toString() || '0';
        estimatedCost = amountIn?.toString() || '0';
      } else if (
        params.type === 'input' &&
        params.toToken.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
      ) {
        try {
          // For selling tokens, calculate estimated BNB output
          const estimatedBnb = await this.factory.calcSellCost(tokenInfo, amountIn || 0n);
          estimatedAmount = estimatedBnb.toString();

          // Use the specific function signature for sellToken with 2 parameters
          txData = this.factory.interface.encodeFunctionData('sellToken(address,uint256)', [
            params.fromToken,
            amountIn || 0n,
          ]);
          estimatedCost = '0';
        } catch (error) {
          console.error('Error calculating sell cost:', error);
          // Provide a fallback estimation based on current price
          if (tokenInfo.lastPrice && tokenInfo.lastPrice > 0n) {
            estimatedAmount = (
              ((amountIn || 0n) * tokenInfo.lastPrice) /
              ethers.parseUnits('1', 18)
            ).toString();
          } else {
            throw new Error('Unable to calculate sell price - insufficient liquidity');
          }
        }
      }

      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: SwapQuote = {
        network: params.network,
        quoteId,
        fromToken: tokenIn,
        toToken: tokenOut,
        slippage: 10,
        fromAmount: ethers.formatUnits(amountIn?.toString() || '0', tokenIn.decimals),
        toAmount: ethers.formatUnits(estimatedAmount, tokenOut.decimals),
        priceImpact: 0,
        route: ['four-meme'],
        estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
        type: params.type,
        tx: {
          to: CONSTANTS.FOUR_MEME_FACTORY_V2,
          data: txData,
          value,
          gasLimit: BigInt(CONSTANTS.DEFAULT_GAS_LIMIT),
          network: params.network,
          spender: CONSTANTS.FOUR_MEME_FACTORY_V2,
        },
      };

      this.quotes.set(quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets the message that needs to be signed for token creation
   * @param userAddress The address of the user creating the token
   * @param network The network to create the token on
   * @returns The message to be signed
   */
  async buildSignatureMessage(
    userAddress: string,
    network: NetworkName = NetworkName.BNB,
  ): Promise<string> {
    try {
      // Step 1: Get nonce from API
      const nonce = await this.getNonce(userAddress, network);

      // Return the message to be signed
      const message = `You are sign in Meme ${nonce}`;
      return message;
    } catch (error: unknown) {
      console.error('Error getting signature message:', error);
      throw new Error(
        `Failed to get signature message: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Creates a new token on the Four Meme platform
   * @param params Token creation parameters
   * @param userAddress The address of the user creating the token
   * @param signature The signature of the message returned by getSignatureMessage
   * @param signer Ethers signer to execute the transaction
   * @returns Transaction hash of the token creation
   */
  async buildCreateToken(
    params: CreateTokenParams,
    userAddress: string,
    signature: string,
  ): Promise<string> {
    try {
      const network = params.network || NetworkName.BNB;

      // Step 1: Get access token
      const accessToken = await this.getAccessToken(signature, userAddress, network);

      // Step 2: Get imgUrl
      const imgUrl = await this.uploadImageUrl(signature, userAddress, network);
      // Step 2: Call create token API to get createArg
      const createResponse = await this.callCreateTokenAPI({
        accessToken,
        name: params.name,
        shortName: params.symbol,
        desc: params.description,
        totalSupply: params.totalSupply || 1000000000,
        raisedAmount: params.raisedAmount || 24,
        saleRate: params.saleRate || 0.8,
        signature,
        userAddress,
        network,
        imgUrl,
      });

      if (createResponse.code !== 0) {
        throw new Error(`Failed to create token: ${createResponse.msg}`);
      }

      // Step 2: Call the contract's createToken method
      const createArg = createResponse.data.createArg;
      const signature4Meme = createResponse.data.signature;

      const tx = this.factory.interface.encodeFunctionData('createToken(bytes, bytes)', [
        createArg,
        signature4Meme,
      ]);

      const token: {
        name: string;
        description: string;
        symbol: string;
      } = {
        symbol: params.symbol,
        name: params.name,
        description: params.description,
      };

      const quoteId = ethers.hexlify(ethers.randomBytes(32));

      const quote: any = {
        network: params.network,
        quoteId,
        token,
        route: ['four-meme'],
        tx: {
          to: CONSTANTS.FOUR_MEME_FACTORY_V2,
          data: tx,
          value: 0,
          network: params.network,
          spender: CONSTANTS.FOUR_MEME_FACTORY_V2,
        },
      };

      this.quotes.set(quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

      return quote;
    } catch (error: unknown) {
      console.error('Error creating token:', error);
      throw new Error(
        `Failed to create token: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  /**
   * Gets a nonce from the Four Meme API for token creation
   */
  private async getNonce(accountAddress: string, network: NetworkName): Promise<NonceResponse> {
    const networkCode = network === NetworkName.BNB ? 'BSC' : 'ETH';

    const response = await fetch(`${CONSTANTS.FOUR_MEME_API_BASE}/private/user/nonce/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        accountAddress,
        verifyType: 'LOGIN',
        networkCode,
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }
    const nonceResponse = await response.json();

    return nonceResponse.data;
  }

  /**
   * Gets a nonce from the Four Meme API for token creation
   */
  private async getAccessToken(
    signature: string,
    address: string,
    network: NetworkName,
  ): Promise<any> {
    const response = await fetch(`${CONSTANTS.FOUR_MEME_API_BASE}/private/user/login/dex`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        verifyInfo: {
          signature,
          address,
          networkCode: 'BSC',
          verifyType: 'LOGIN',
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    const accessTokenResponse = await response.json();
    return accessTokenResponse.data;
  }

  private async uploadImageUrl(
    signature: string,
    address: string,
    network: NetworkName,
  ): Promise<string> {
    // const response = await fetch('https://four.meme/meme-api/v1/private/user/upload', {
    //   method: 'POST',
    //   headers: {
    //     'Content-Type': 'application/json',
    //     Accept: 'application/json',
    //     'meme-web-access': signature,
    //   },
    //   body: JSON.stringify({
    //     address,
    //     networkCode: 'BSC',
    //   }),
    // });

    // if (!response.ok) {
    //   throw new Error(`API request failed with status ${response.status}`);
    // }
    // const uploadImageResponse = await response.json();

    // console.log('🤖 Upload image response:', uploadImageResponse);

    return 'https://static.four.meme/market/6fbb933c-7dde-4d0a-960b-008fd727707f4551736094573656710.jpg';
  }

  /**
   * Calls the Four Meme API to create a token and get the createArg
   */
  private async callCreateTokenAPI(params: {
    accessToken: string;
    name: string;
    shortName: string;
    desc: string;
    totalSupply: number;
    raisedAmount: number;
    saleRate: number;
    signature: string;
    userAddress: string;
    network: NetworkName;
    imgUrl: string;
  }): Promise<CreateMemeResponse> {
    // Current timestamp in milliseconds
    const launchTime = Date.now();

    const response = await fetch(`${CONSTANTS.FOUR_MEME_API_BASE}/private/token/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'meme-web-access': params.accessToken,
      },
      body: JSON.stringify({
        name: params.name,
        shortName: params.shortName,
        desc: params.desc,
        totalSupply: params.totalSupply,
        raisedAmount: params.raisedAmount,
        saleRate: params.saleRate,
        reserveRate: 0,
        imgUrl: params.imgUrl,
        launchTime,
        funGroup: false,
        preSale: 0,
        clickFun: false,
        symbol: 'BNB',
        label: 'Meme',
      }),
    });

    if (!response.ok) {
      throw new Error(`API request failed with status ${response.status}`);
    }

    return await response.json();
  }
}
