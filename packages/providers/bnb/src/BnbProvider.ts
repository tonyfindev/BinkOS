import { IWalletProvider, WalletBalance, WalletInfo } from '@binkai/wallet-plugin';
import { ethers } from 'ethers';
import { NetworkName } from '../../../core/src';

interface BnbProviderConfig {
  rpcUrl?: string;
}

const ERC20_ABI = [
  'function balanceOf(address owner) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
];

export class BnbProvider implements IWalletProvider {
  private provider: ethers.JsonRpcProvider;

  constructor(config: BnbProviderConfig) {
    this.provider = new ethers.JsonRpcProvider(
      config.rpcUrl || 'https://bsc-dataseed1.binance.org',
    );
  }

  getName(): string {
    return 'bnb';
  }

  getSupportedNetworks(): NetworkName[] {
    return [NetworkName.BNB];
  }

  async getWalletInfo(address: string, network?: NetworkName): Promise<WalletInfo> {
    const nativeBalance = await this.getNativeBalance(address, network);
    return {
      address,
      nativeBalance: nativeBalance,
      tokens: undefined,
      //   totalUsdValue,
    };
  }

  async getNativeBalance(address: string, network?: NetworkName): Promise<WalletBalance> {
    const balance = await this.provider.getBalance(address);
    return {
      symbol: 'BNB',
      balance: ethers.formatUnits(balance, 18),
      decimals: 18,
      //   usdValue: 0, // Implement price fetching logic
    };
  }

  async getTokenBalances(address: string, network?: NetworkName): Promise<WalletBalance[]> {
    // This would typically call the BSCScan API to get token list
    // For demo, returning empty array
    // Implement BSCScan API integration for full functionality
    return [];
  }

  private async getTokenBalance(
    tokenAddress: string,
    walletAddress: string,
  ): Promise<WalletBalance> {
    const contract = new ethers.Contract(tokenAddress, ERC20_ABI, this.provider);

    const [balance, decimals, symbol] = await Promise.all([
      contract.balanceOf(walletAddress),
      contract.decimals(),
      contract.symbol(),
    ]);

    return {
      symbol,
      balance: balance.toString(),
      decimals,
      address: tokenAddress,
      //   usdValue: 0, // Implement price fetching logic
    };
  }
}
