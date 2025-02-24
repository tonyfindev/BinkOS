import { ISwapProvider, SwapQuote, SwapParams, SwapTransaction } from './types';
import { ethers, Contract, Interface, Provider } from 'ethers';

export interface Token {
  address: `0x${string}`;
  decimals: number;
  symbol: string;
}

export abstract class BaseSwapProvider implements ISwapProvider {
  protected provider: Provider;
  protected tokenCache: Map<string, { token: Token; timestamp: number }> = new Map();
  protected readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  protected quotes: Map<string, { quote: SwapQuote; expiresAt: number }> = new Map();
  protected readonly QUOTE_EXPIRY = 5 * 60 * 1000; // 5 minutes
  protected readonly GAS_BUFFER = ethers.parseEther('0.01'); // Default gas buffer

  constructor(provider: Provider) {
    this.provider = provider;
  }

  abstract getName(): string;
  abstract getSupportedChains(): string[];
  abstract getQuote(params: SwapParams, userAddress: string): Promise<SwapQuote>;

  getPrompt?(): string;

  protected abstract isNativeToken(tokenAddress: string): boolean;

  /**
   * Adjusts the input amount for native token swaps to account for gas costs
   * @param amount The original amount to spend
   * @param decimals The decimals of the token
   * @param userAddress The address of the user
   * @returns The adjusted amount after accounting for gas buffer
   */
  protected async adjustNativeTokenAmount(
    amount: string,
    decimals: number,
    userAddress: string,
  ): Promise<string> {
    const amountBN = ethers.parseUnits(amount, decimals);
    const balance = await this.provider.getBalance(userAddress);

    // Check if user has enough balance for amount + gas buffer
    if (balance < amountBN + this.GAS_BUFFER) {
      // If not enough balance for both, ensure at least gas buffer is available
      if (amountBN <= this.GAS_BUFFER) {
        throw new Error(
          `Amount too small. Minimum amount should be greater than ${ethers.formatEther(this.GAS_BUFFER)} native token to cover gas`,
        );
      }
      // Subtract gas buffer from amount
      const adjustedAmountBN = amountBN - this.GAS_BUFFER;
      const adjustedAmount = ethers.formatUnits(adjustedAmountBN, decimals);
      console.log(
        '🤖 Adjusted amount for gas buffer:',
        adjustedAmount,
        '(insufficient balance for full amount + gas)',
      );
      return adjustedAmount;
    }

    console.log('🤖 Using full amount:', amount, '(sufficient balance for amount + gas)');
    return amount;
  }

  protected async getTokenInfo(tokenAddress: string): Promise<Token> {
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
    };
  }

  protected async getToken(tokenAddress: string): Promise<Token> {
    const now = Date.now();
    const cached = this.tokenCache.get(tokenAddress);

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.token;
    }

    const info = await this.getTokenInfo(tokenAddress);
    const token = {
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
      const tokenToCheck = quote.fromToken;
      const requiredAmount = ethers.parseUnits(quote.fromAmount, quote.fromTokenDecimals);

      // Check if the token is native token
      const isNativeToken = this.isNativeToken(tokenToCheck);

      if (isNativeToken) {
        const balance = await this.provider.getBalance(userAddress);
        const totalRequired = requiredAmount + this.GAS_BUFFER;

        if (balance < totalRequired) {
          const formattedBalance = ethers.formatEther(balance);
          const formattedRequired = ethers.formatEther(requiredAmount);
          const formattedTotal = ethers.formatEther(totalRequired);
          return {
            isValid: false,
            message: `Insufficient native token balance. Required: ${formattedRequired} (+ ~${ethers.formatEther(this.GAS_BUFFER)} for gas = ${formattedTotal}), Available: ${formattedBalance}`,
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

        // Check if user has enough native token for gas
        const nativeBalance = await this.provider.getBalance(userAddress);
        if (nativeBalance < this.GAS_BUFFER) {
          const formattedBalance = ethers.formatEther(nativeBalance);
          return {
            isValid: false,
            message: `Insufficient native token for gas fees. Required: ~${ethers.formatEther(this.GAS_BUFFER)}, Available: ${formattedBalance}`,
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

  async buildApproveTransaction(
    token: string,
    spender: string,
    amount: string,
    userAddress: string,
  ): Promise<SwapTransaction> {
    if (this.isNativeToken(token)) {
      throw new Error('Native token does not need approval');
    }

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
      gasLimit: '100000',
    };
  }

  async checkAllowance(token: string, owner: string, spender: string): Promise<bigint> {
    if (this.isNativeToken(token)) {
      return BigInt(Number.MAX_SAFE_INTEGER) * BigInt(10 ** 18);
    }

    const erc20 = new Contract(
      token,
      ['function allowance(address owner, address spender) view returns (uint256)'],
      this.provider,
    );
    return await erc20.allowance(owner, spender);
  }

  protected storeQuote(quote: SwapQuote, additionalData?: any) {
    this.quotes.set(quote.quoteId, {
      quote,
      expiresAt: Date.now() + this.QUOTE_EXPIRY,
      ...additionalData,
    });

    setTimeout(() => {
      this.quotes.delete(quote.quoteId);
    }, this.QUOTE_EXPIRY);
  }

  async buildSwapTransaction(quote: SwapQuote, userAddress: string): Promise<SwapTransaction> {
    try {
      const storedData = this.quotes.get(quote.quoteId);
      if (!storedData) {
        throw new Error('Quote expired or not found. Please get a new quote.');
      }

      return {
        to: storedData.quote.tx?.to || '',
        data: storedData.quote.tx?.data || '',
        value: storedData.quote.tx?.value || '0',
        gasLimit: storedData.quote.tx?.gasLimit || '350000',
      };
    } catch (error) {
      console.error('Error building swap transaction:', error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
