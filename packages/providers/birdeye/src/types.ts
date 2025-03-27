import { NetworkName } from '@binkai/core';

export interface BirdeyeTokenResponse {
  success: boolean;
  data: {
    items: Array<{
      type: string;
      result: Array<{
        name: string;
        symbol: string;
        address: string;
        price: number;
        price_change_24h_percent: number;
        volume_24h_usd: number;
        market_cap: number | null;
        liquidity: number;
        network: string;
        // logo_uri: string;
        decimals?: number;
      }>;
    }>;
  };
}

export interface TokenOverviewResponse {
  success: boolean;
  data: {
    address: string;
    decimals: number;
    symbol: string;
    name: string;
    extensions?: {
      coingeckoId?: string;
      website?: string;
      twitter?: string;
      discord?: string;
    };
    // logoURI: string;
    price: number;
    liquidity: number;
    priceChange24hPercent: number;
    volume_24h: number;
    volume_24h_usd: number;
    market_cap?: number;
    holder: number;
    v24hUSD?: number;
    marketCap?: number;
    mc?: number;
  };
}

export interface TokenSecurityResponse {
  success: boolean;
  data: {
    // bsc
    buyTax: string;
    canTakeBackOwnership: string;
    hiddenOwner: string;
    isHoneypot: string;
    sellTax: string;
    isMintable: string;
    // solana
    mutableMetadata: boolean;
    fakeToken: any;
    freezeable: any;
    freezeAuthority: any;
    transferFeeEnable: any;

    top10HolderBalance: number;
    top10HolderPercent: number;
    top10UserBalance: number;
    top10UserPercent: number;
    isTrueToken: boolean;
    totalSupply: number;
    preMarketHolder: any[];
    lockInfo: any;
    transferFeeData: any;
    isToken2022: boolean;
    nonTransferable: boolean;
  };
}

export interface BirdeyeConfig {
  apiKey?: string;
  baseUrl?: string;
}

export const CHAIN_MAPPING = {
  [NetworkName.SOLANA]: 'solana',
  [NetworkName.ETHEREUM]: 'ethereum',
  [NetworkName.BNB]: 'bsc', // BSC chain mapping
  [NetworkName.POLYGON]: 'polygon',
  [NetworkName.ARBITRUM]: 'arbitrum',
  [NetworkName.OPTIMISM]: 'optimism',
  // Add more chains as they become supported
} as const;

export type SupportedChain = keyof typeof CHAIN_MAPPING;
