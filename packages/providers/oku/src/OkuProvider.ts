import { ISwapProvider, SwapQuote, SwapParams } from '@binkai/swap-plugin';
import { ethers, Contract, Interface, Provider } from 'ethers';

// Enhanced interface with better type safety
interface TokenInfo extends Token {
  // Inherits all Token properties and maintains DRY principle
}

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  BNB_ADDRESS: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',
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

export class OkuProvider implements ISwapProvider {
  private provider: Provider;
  private chainId: ChainId;
  // Token cache with expiration time
  private tokenCache: Map<string, { token: Token; timestamp: number }> = new Map();
  private readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes

  // Quote storage with expiration
  private quotes: Map<string, { quote: SwapQuote; expiresAt: number }> = new Map();

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    this.provider = provider;
    this.chainId = chainId;
  }

  getName(): string {
    return 'oku';
  }

  getSupportedChains(): string[] {
    return ['bnb', 'ethereum'];
  }

  getPrompt(): string {
    return `If you are using OkuSwap, You can use BNB with address ${CONSTANTS.BNB_ADDRESS}`;
  }

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

  /**
   * Retrieves token information with caching and TTL
   * @param tokenAddress The address of the token
   * @returns Promise<Token>
   */
  private async getToken(tokenAddress: string): Promise<Token> {
    const now = Date.now();
    const cached = this.tokenCache.get(tokenAddress);

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.token;
    }

    const info = await this.getTokenInfo(tokenAddress);
    console.log('🤖 Token info', info);
    const token = {
      chainId: info.chainId,
      address: info.address.toLowerCase() as `0x${string}`,
      decimals: info.decimals,
      symbol: info.symbol,
    };

    this.tokenCache.set(tokenAddress, { token, timestamp: now });
    return token;
  }

  async checkBalance(
    quote: SwapQuote,
    userAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      // For input swaps, check the fromToken balance
      // For output swaps, we still need to check the fromToken as that's what user will spend
      const tokenToCheck = quote.fromToken;
      const requiredAmount = ethers.parseUnits(quote.fromAmount, quote.fromTokenDecimals);

      // If the token is BNB, check native balance
      if (tokenToCheck.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()) {
        const balance = await this.provider.getBalance(userAddress);

        if (balance < requiredAmount) {
          const formattedBalance = ethers.formatUnits(balance, 18);
          const formattedRequired = ethers.formatUnits(requiredAmount, 18);
          return {
            isValid: false,
            message: `Insufficient BNB balance. Required: ${formattedRequired} BNB, Available: ${formattedBalance} BNB`,
          };
        }
      } else {
        // For other tokens, check ERC20 balance
        const erc20 = new Contract(
          tokenToCheck,
          ['function balanceOf(address) view returns (uint256)'],
          this.provider,
        );
        const balance = await erc20.balanceOf(userAddress);

        if (balance < requiredAmount) {
          const token = await this.getToken(tokenToCheck);
          const formattedBalance = ethers.formatUnits(balance, token.decimals);
          const formattedRequired = ethers.formatUnits(requiredAmount, token.decimals);
          return {
            isValid: false,
            message: `Insufficient ${token.symbol} balance. Required: ${formattedRequired} ${token.symbol}, Available: ${formattedBalance} ${token.symbol}`,
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
  async getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote> {
    try {
      if (params.type === 'output') {
        throw new Error('OKU does not support output swaps');
      }

      const [tokenIn, tokenOut] = await Promise.all([
        this.getToken(params.fromToken),
        this.getToken(params.toToken),
      ]);

      const amountIn =
        params.type === 'input'
          ? Math.floor(Number(params.amount) * 10 ** tokenIn.decimals)
          : Math.floor(Number(params.amount) * 10 ** tokenOut.decimals);

      // Convert BNB addresses to OKU format
      const tokenInAddress =
        tokenIn.address.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
          ? CONSTANTS.OKU_BNB_ADDRESS
          : tokenIn.address;
      const tokenOutAddress =
        tokenOut.address.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()
          ? CONSTANTS.OKU_BNB_ADDRESS
          : tokenOut.address;

      const now = new Date();

      // const isoString = now.toISOString();
      // console.log("tesst1",params.slippage)
      const slippageOKU = params.slippage || 10;
      const headers = {
        'Content-Type': 'application/json',
      };
      const body = JSON.stringify({
        chain: 'bsc',
        account: userAddress,
        inTokenAddress: tokenInAddress,
        outTokenAddress: tokenOutAddress,
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
    if (token.toLowerCase() === CONSTANTS.BNB_ADDRESS.toLowerCase()) {
      return BigInt(Number.MAX_SAFE_INTEGER);
    }
    const erc20 = new Contract(
      token,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider,
    );
    return await erc20.allowance(owner, spender);
  }
}
