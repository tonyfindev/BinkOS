import { NetworkName, Token } from '@binkai/core';
import { IBridgeProvider, BridgeQuote, BridgeParams, Transaction } from './types';
import { ethers, Contract, Interface, Provider } from 'ethers';
import { clusterApiUrl, Connection, PublicKey } from '@solana/web3.js';

export type NetworkProvider = Provider | Connection;

export abstract class BaseBridgeProvider implements IBridgeProvider {
  protected providers: Map<NetworkName, NetworkProvider> = new Map();
  protected tokenCache: Map<string, { token: Token; timestamp: number }> = new Map();
  protected readonly CACHE_TTL = 30 * 60 * 1000; // 30 minutes
  protected quotes: Map<string, { quote: BridgeQuote; expiresAt: number }> = new Map();
  protected readonly QUOTE_EXPIRY = 5 * 60 * 1000; // 5 minutes

  // Network-specific gas buffers
  protected readonly GAS_BUFFERS: Record<NetworkName, bigint> = {
    [NetworkName.ETHEREUM]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.POLYGON]: ethers.parseEther('0.1'), // 0.1 MATIC
    [NetworkName.ARBITRUM]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.OPTIMISM]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.BNB]: ethers.parseEther('0.001'), // 0.001 BNB
    [NetworkName.SOLANA]: BigInt(10000000), // 0.001 SOL in lamports
    [NetworkName.SEPOLIA]: ethers.parseEther('0.001'), // 0.001 ETH
    [NetworkName.SOLANA_DEVNET]: BigInt(10000000), // 0.001 SOL in lamports
  };

  constructor(providerConfig: Map<NetworkName, NetworkProvider>) {
    // Validate providers against supported networks
    const supportedNetworks = this.getSupportedNetworks();
    for (const [network, provider] of providerConfig.entries()) {
      if (!supportedNetworks.includes(network)) {
        throw new Error(`Networkk ${network} is not supported by ${this.getName()}`);
      }
      // Validate provider type based on network
      if (this.isSolanaNetwork(network) && !(provider instanceof Connection)) {
        throw new Error(`Invalid provider type for Solana network ${network}`);
      }
      if (!this.isSolanaNetwork(network) && !this.isProviderInstance(provider)) {
        throw new Error(`Invalid provider type for EVM network ${network}`);
      }
    }
    this.providers = providerConfig;
  }

  protected isSolanaNetwork(network: NetworkName): boolean {
    return network === NetworkName.SOLANA || network === NetworkName.SOLANA_DEVNET;
  }

  protected isProviderInstance(provider: NetworkProvider): provider is Provider {
    return 'getNetwork' in provider && 'getBlockNumber' in provider;
  }

  protected isSolanaProvider(provider: NetworkProvider): provider is Connection {
    return provider instanceof Connection;
  }

  /**
   * Get the EVM provider for a specific network
   * @param network The network to get the provider for
   * @returns The EVM provider for the specified network
   * @throws Error if the network is not supported or if it's not an EVM network
   */
  protected getEvmProviderForNetwork(network: NetworkName): Provider {
    const provider = this.providers.get(network);
    if (!provider) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
    if (!this.isProviderInstance(provider)) {
      throw new Error(`Network ${network} does not have an EVM provider`);
    }
    return provider;
  }

  /**
   * Get the Solana provider for a specific network
   * @param network The network to get the provider for
   * @returns The Solana provider for the specified network
   * @throws Error if the network is not supported or if it's not a Solana network
   */
  protected getSolanaProviderForNetwork(network: NetworkName): Connection {
    const provider = this.providers.get(network);
    if (!provider) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
    if (!this.isSolanaProvider(provider)) {
      throw new Error(`Network ${network} does not have a Solana provider`);
    }
    return provider;
  }

  /**
   * Check if a network is supported by this provider
   * @param network The network to check
   * @returns True if the network is supported, false otherwise
   */
  protected isNetworkSupported(network: NetworkName): boolean {
    return this.getSupportedNetworks().includes(network) && this.providers.has(network);
  }

  abstract getName(): string;
  abstract getQuote(
    params: BridgeParams,
    fromWalletAddress: string,
    toWalletAddress: string,
  ): Promise<BridgeQuote>;
  abstract getSupportedNetworks(): NetworkName[];

  getPrompt?(): string;

  protected abstract isNativeToken(tokenAddress: string): boolean;

  /**
   * Validates if the network is supported
   * @param network The network to validate
   * @throws Error if the network is not supported
   */
  protected validateNetwork(network: NetworkName): void {
    if (!this.isNetworkSupported(network)) {
      throw new Error(`Network ${network} is not supported by ${this.getName()}`);
    }
  }

  /**
   * Get the gas buffer for a specific network
   * @param network The network to get the gas buffer for
   * @returns The gas buffer amount for the specified network
   */
  protected getGasBuffer(network: NetworkName): bigint {
    const buffer = this.GAS_BUFFERS[network];
    if (!buffer) {
      throw new Error(`No gas buffer defined for network ${network}`);
    }
    return buffer;
  }

  /**
   * Adjusts the input amount for native token swaps to account for gas costs
   * @param amount The original amount to spend
   * @param decimals The decimals of the token
   * @param walletAddress The address of the user
   * @param network The network to use
   * @returns The adjusted amount after accounting for gas buffer
   */
  protected async adjustNativeTokenAmount(
    amount: string,
    decimals: number,
    walletAddress: string,
    network: NetworkName,
  ): Promise<string> {
    this.validateNetwork(network);
    if (this.isSolanaNetwork(network)) {
      // TODO: Implement Solana

      console.log('isSolanaNetwork');
    }
    const provider = this.getEvmProviderForNetwork(network);
    const amountBN = ethers.parseUnits(amount, decimals);
    const balance = await provider.getBalance(walletAddress);
    const gasBuffer = this.getGasBuffer(network);

    // Check if user has enough balance for amount + gas buffer
    if (balance < amountBN + gasBuffer) {
      // If not enough balance for both, ensure at least gas buffer is available
      if (amountBN <= gasBuffer) {
        throw new Error(
          `Amount too small. Minimum amount should be greater than ${ethers.formatEther(gasBuffer)} native token to cover gas`,
        );
      }
      // Subtract gas buffer from amount
      const adjustedAmountBN = amountBN - gasBuffer;
      const adjustedAmount = ethers.formatUnits(adjustedAmountBN, decimals);
      console.log(
        '🤖 Adjusted amount for gas buffer:',
        adjustedAmount,
        `(insufficient balance for full amount + ${ethers.formatEther(gasBuffer)} gas)`,
      );
      return adjustedAmount;
    }

    console.log(
      '🤖 Using full amount:',
      amount,
      `(sufficient balance for amount + ${ethers.formatEther(gasBuffer)} gas)`,
    );
    return amount;
  }

  protected async getTokenInfo(tokenAddress: string, network: NetworkName): Promise<Token> {
    this.validateNetwork(network);
    if (this.isSolanaNetwork(network)) {
      // TODO: Implement Solana

      const connection = new Connection(clusterApiUrl('mainnet-beta'));
      const tokenMint = new PublicKey(tokenAddress);
      const tokenInfo = await connection.getParsedAccountInfo(tokenMint);

      if (!tokenInfo.value || !('parsed' in tokenInfo.value.data)) {
        throw new Error(`Token ${tokenAddress} not found on ${network}`);
      }

      const parsedData = tokenInfo.value.data.parsed;
      const decimals = parsedData.info.decimals;
      const symbol = parsedData.info.symbol;

      return {
        address: tokenAddress,
        decimals: Number(decimals),
        symbol,
      };
    }
    // For EVM tokens
    const provider = this.getEvmProviderForNetwork(network);
    const erc20Interface = new Interface([
      'function decimals() view returns (uint8)',
      'function symbol() view returns (string)',
    ]);

    const contract = new Contract(tokenAddress, erc20Interface, provider);
    const [decimals, symbol] = await Promise.all([contract.decimals(), contract.symbol()]);

    return {
      address: tokenAddress.toLowerCase() as `0x${string}`,
      decimals: Number(decimals),
      symbol,
    };
  }

  protected async getToken(tokenAddress: string, network: NetworkName): Promise<Token> {
    this.validateNetwork(network);
    if (this.isSolanaNetwork(network)) {
      console.log('isSolanaNetwork');
      // TODO: Implement Solana
    }
    const now = Date.now();
    const cacheKey = `${network}:${tokenAddress}`;
    const cached = this.tokenCache.get(cacheKey);

    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.token;
    }

    const info = await this.getTokenInfo(tokenAddress, network);
    const token = {
      address: this.isSolanaNetwork(network)
        ? info.address
        : (info.address.toLowerCase() as `0x${string}`),
      decimals: info.decimals,
      symbol: info.symbol,
    };

    this.tokenCache.set(cacheKey, { token, timestamp: now });
    return token;
  }

  async checkBalance(
    quote: BridgeQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      this.validateNetwork(quote.fromNetwork);
      if (this.isSolanaNetwork(quote.fromNetwork)) {
        // TODO: Implement Solana
      }
      const provider = this.getEvmProviderForNetwork(quote.fromNetwork);
      const tokenToCheck = quote.fromToken;
      const requiredAmount = ethers.parseUnits(quote.fromAmount, quote.fromToken.decimals);
      const gasBuffer = this.getGasBuffer(quote.fromNetwork);

      // Check if the token is native token
      const isNativeToken = this.isNativeToken(tokenToCheck.address);

      if (isNativeToken) {
        const balance = await provider.getBalance(walletAddress);
        const totalRequired = requiredAmount + gasBuffer;

        if (balance < totalRequired) {
          const formattedBalance = ethers.formatEther(balance);
          const formattedRequired = ethers.formatEther(requiredAmount);
          const formattedTotal = ethers.formatEther(totalRequired);
          return {
            isValid: false,
            message: `Insufficient native token balance. Required: ${formattedRequired} (+ ~${ethers.formatEther(gasBuffer)} for gas = ${formattedTotal}), Available: ${formattedBalance}`,
          };
        }
      } else {
        // For other tokens, check ERC20 balance
        const erc20 = new Contract(
          tokenToCheck.address,
          [
            'function balanceOf(address) view returns (uint256)',
            'function symbol() view returns (string)',
          ],
          provider,
        );

        const [balance, symbol] = await Promise.all([
          erc20.balanceOf(walletAddress),
          erc20.symbol(),
        ]);

        if (balance < requiredAmount) {
          const formattedBalance = ethers.formatUnits(balance, quote.fromToken.decimals);
          const formattedRequired = ethers.formatUnits(requiredAmount, quote.fromToken.decimals);
          return {
            isValid: false,
            message: `Insufficient ${symbol} balance. Required: ${formattedRequired} ${symbol}, Available: ${formattedBalance} ${symbol}`,
          };
        }

        // Check if user has enough native token for gas
        const nativeBalance = await provider.getBalance(walletAddress);
        if (nativeBalance < gasBuffer) {
          const formattedBalance = ethers.formatEther(nativeBalance);
          return {
            isValid: false,
            message: `Insufficient native token for gas fees. Required: ~${ethers.formatEther(gasBuffer)}, Available: ${formattedBalance}`,
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

  protected storeQuote(quote: BridgeQuote, additionalData?: any) {
    this.quotes.set(quote.quoteId, {
      quote,
      expiresAt: Date.now() + this.QUOTE_EXPIRY,
      ...additionalData,
    });

    setTimeout(() => {
      this.quotes.delete(quote.quoteId);
    }, this.QUOTE_EXPIRY);
  }

  async buildBridgeTransaction(quote: BridgeQuote, walletAddress: string): Promise<Transaction> {
    try {
      this.validateNetwork(quote.fromNetwork);
      if (this.isSolanaNetwork(quote.fromNetwork)) {
        // TODO: Implement Solana
      }
      const storedData = this.quotes.get(quote.quoteId);
      if (!storedData) {
        throw new Error('Quote expired or not found. Please get a new quote.');
      }

      return {
        to: storedData.quote.tx?.to || '',
        data: storedData.quote.tx?.data || '',
        value: storedData.quote.tx?.value || '0',
        gasLimit: storedData.quote.tx?.gasLimit,
        network: storedData.quote.fromNetwork,
      };
    } catch (error) {
      console.error('Error building bridge transaction:', error);
      throw new Error(
        `Failed to build swap transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }
}
