import {
  BaseStakingProvider,
  StakingParams,
  StakingQuote,
  NetworkProvider,
} from '@binkai/staking-plugin';
import { ethers, Contract, Provider } from 'ethers';
import { VenusPoolABI } from './abis/VenusPool';
import { EVM_NATIVE_TOKEN_ADDRESS, NetworkName, Token } from '@binkai/core';

// Core system constants
const CONSTANTS = {
  DEFAULT_GAS_LIMIT: '350000',
  APPROVE_GAS_LIMIT: '50000',
  QUOTE_EXPIRY: 5 * 60 * 1000, // 5 minutes in milliseconds
  BNB_ADDRESS: EVM_NATIVE_TOKEN_ADDRESS,
  VENUS_API_BASE: 'https://api.venus.io/',
  VENUS_POOL_ADDRESS: '0xa07c5b74c9b40447a954e1466938b865b6bbea36',
} as const;

enum ChainId {
  BSC = 56,
  ETH = 1,
}

// Add these interfaces before the VenusProvider class

interface VenusPoolsResponse {
  limit: number;
  page: number;
  total: number;
  result: VenusPool[];
}

interface VenusPool {
  address: string;
  chainId: string;
  name: string;
  description: string | null;
  priceOracleAddress: string;
  closeFactorMantissa: string;
  liquidationIncentiveMantissa: string;
  minLiquidatableCollateralMantissa: string;
  markets: VenusMarket[];
}

interface VenusMarket {
  address: string;
  chainId: string;
  symbol: string;
  name: string;
  underlyingAddress: string;
  underlyingName: string;
  underlyingSymbol: string;
  underlyingDecimal: number;

  // Interest rates
  borrowRatePerBlock: string;
  supplyRatePerBlock: string;
  borrowApy: string;
  supplyApy: string;

  // Market state
  exchangeRateMantissa: string;
  underlyingPriceMantissa: string;
  totalBorrowsMantissa: string;
  totalSupplyMantissa: string;
  cashMantissa: string;
  totalReservesMantissa: string;

  // Configuration
  reserveFactorMantissa: string;
  collateralFactorMantissa: string;
  supplyCapsMantissa: string;
  borrowCapsMantissa: string;

  // Market metrics
  borrowerCount: number;
  supplierCount: number;
  liquidityCents: string;
  tokenPriceCents: string;

  // Status
  pausedActionsBitmap: number;
  isListed: boolean;

  // Rewards
  rewardsDistributors: RewardDistributor[];
}

interface RewardDistributor {
  id: string;
  marketAddress: string;
  rewardTokenAddress: string;
  chainId: string;
  supplySpeed: string;
  borrowSpeed: string;
  priceMantissa: string;
  rewardType: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export class VenusProvider extends BaseStakingProvider {
  private chainId: ChainId;
  private factory: any;
  protected GAS_BUFFER: bigint = ethers.parseEther('0.0003');

  constructor(provider: Provider, chainId: ChainId = ChainId.BSC) {
    // Create a Map with BNB network and the provider
    const providerMap = new Map<NetworkName, NetworkProvider>();
    providerMap.set(NetworkName.BNB, provider);
    super(providerMap);

    this.chainId = chainId;
    this.factory = new Contract(CONSTANTS.VENUS_POOL_ADDRESS, VenusPoolABI, provider);
  }

  getName(): string {
    return 'venus';
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

  async getQuote(params: StakingParams, userAddress: string): Promise<StakingQuote> {
    try {
      // Check if tokenA is BNB
      if (params.tokenA.toLowerCase() !== CONSTANTS.BNB_ADDRESS.toLowerCase() || params.tokenB) {
        throw new Error(`Venus does not support supplying BNB tokens`);
      }

      // Fetch input and output token information
      const [tokenA, tokenB] = await Promise.all([
        this.getToken(params.tokenA, params.network),
        params.tokenB
          ? this.getToken(params.tokenB, params.network)
          : this.getToken(params.tokenA, params.network),
      ]);

      // Calculate input amount based on decimals
      const swapAmountA = BigInt(Math.floor(Number(params.amountA) * 10 ** tokenA.decimals));
      const swapAmountB = params.amountB
        ? BigInt(Math.floor(Number(params.amountB) * 10 ** tokenB.decimals))
        : swapAmountA;

      // Fetch optimal swap route
      const optimalRoute: VenusMarket = await this.fetchOptimalRoute(CONSTANTS.VENUS_POOL_ADDRESS);

      // Build swap transaction
      const buildTransactionData = await this.buildStakingRouteTransaction(
        optimalRoute,
        swapAmountA,
        swapAmountB,
        params.type,
      );

      // Create and store quote
      const quote = this.createQuote(params, tokenA, tokenB, optimalRoute, buildTransactionData);

      this.storeQuoteWithExpiry(quote);

      return quote;
    } catch (error: unknown) {
      console.error('Error getting quote:', error);
      throw new Error(
        `Failed to get quote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // Helper methods for better separation of concerns
  private async fetchOptimalRoute(poolAddress: string): Promise<VenusMarket> {
    const routePath = `pools?chainId=56`;
    const routeResponse = await fetch(`${CONSTANTS.VENUS_API_BASE}${routePath}`);
    const routeData = (await routeResponse.json()) as VenusPoolsResponse;

    if (!routeData.result || routeData.result.length === 0) {
      throw new Error('No pools available from Venus');
    }

    // First find the Core Pool
    const corePool = routeData.result.find((pool: VenusPool) => pool.name === 'Core Pool');

    if (!corePool) {
      throw new Error('Core Pool not found');
    }

    // Then find the specific market within the Core Pool's markets
    const targetMarket = corePool.markets.find(
      (market: VenusMarket) => market.address.toLowerCase() === poolAddress.toLowerCase(),
    );

    if (!targetMarket) {
      throw new Error(`Market with address ${poolAddress} not found in Venus`);
    }

    return targetMarket;
  }

  private async buildStakingRouteTransaction(
    routeData: VenusMarket,
    amountA: bigint,
    amountB: bigint,
    type: 'stake' | 'unstake' | 'supply' | 'withdraw' = 'stake',
  ) {
    try {
      let txData: string;

      // Handle staking/supply
      if (type === 'stake' || type === 'supply') {
        txData = this.factory.interface.encodeFunctionData('mint', []);

        return {
          to: routeData.address,
          data: txData,
          value: amountA.toString(), // For BNB, the value field is used
          gasLimit: CONSTANTS.DEFAULT_GAS_LIMIT,
        };
      }
      // Handle unstaking/withdraw
      else {
        txData = this.factory.interface.encodeFunctionData('redeemUnderlying', [amountA]);

        return {
          to: routeData.address,
          data: txData,
          value: '0', // No value needed for redeem
          gasLimit: CONSTANTS.DEFAULT_GAS_LIMIT,
        };
      }
    } catch (error) {
      console.error('Error building staking transaction:', error);
      throw new Error(
        `Failed to build staking transaction: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private createQuote(
    params: StakingParams,
    tokenA: Token,
    tokenB: Token,
    swapTransactionData: any,
    buildTransactionData: any,
  ): StakingQuote {
    const quoteId = ethers.hexlify(ethers.randomBytes(32));

    return {
      network: params.network,
      quoteId,
      tokenA: tokenA,
      tokenB: tokenB || null,
      amountA: params.amountA,
      amountB: params.amountB || '0',
      type: params.type,
      currentAPY: Number(swapTransactionData.supplyApy),
      averageAPY: Number(swapTransactionData.supplyApy),
      maxSupply: Number(swapTransactionData.supplyCapsMantissa),
      currentSupply: Number(swapTransactionData.totalSupplyMantissa),
      liquidity: Number(swapTransactionData.liquidityCents),
      estimatedGas: CONSTANTS.DEFAULT_GAS_LIMIT,
      tx: {
        to: buildTransactionData.to,
        data: buildTransactionData.data,
        value: buildTransactionData.value,
        gasLimit: buildTransactionData.gasLimit,
        network: params.network,
      },
    };
  }

  private storeQuoteWithExpiry(quote: StakingQuote) {
    this.quotes.set(quote.quoteId, { quote, expiresAt: Date.now() + CONSTANTS.QUOTE_EXPIRY });

    // Delete quote after expiry
    setTimeout(() => {
      this.quotes.delete(quote.quoteId);
    }, CONSTANTS.QUOTE_EXPIRY);
  }

  async checkBalance(
    quote: StakingQuote,
    walletAddress: string,
  ): Promise<{ isValid: boolean; message?: string }> {
    try {
      if (quote.type === 'stake' || quote.type === 'supply') {
        return { isValid: true };
      }
      this.validateNetwork(quote.network);
      if (this.isSolanaNetwork(quote.network)) {
        // TODO: Implement Solana
      }
      const provider = this.getEvmProviderForNetwork(quote.network);
      const tokenToCheck = quote.tokenA;
      const requiredAmount = ethers.parseUnits(quote.amountA, quote.tokenA.decimals);
      const gasBuffer = this.getGasBuffer(quote.network);

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
          const formattedBalance = ethers.formatUnits(balance, quote.tokenA.decimals);
          const formattedRequired = ethers.formatUnits(requiredAmount, quote.tokenA.decimals);
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
}
