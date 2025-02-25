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
        logo_uri: string;
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
    logoURI: string;
    price: number;
    liquidity: number;
    priceChange24hPercent: number;
    volume_24h: number;
    volume_24h_usd: number;
    market_cap: number;
    holder: number;
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
  // Add more chains as they become supported
} as const;

export type SupportedChain = keyof typeof CHAIN_MAPPING;
