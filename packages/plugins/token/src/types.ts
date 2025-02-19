import { z } from 'zod';

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply?: string;
  price?: {
    usd?: number;
    nativeToken?: number;
  };
  marketCap?: number;
  volume24h?: number;
  priceChange24h?: number;
  logoURI?: string;
  verified?: boolean;
}

export interface TokenQueryParams {
  query: string; // Can be address or symbol
  chain?: string;
  includePrice?: boolean;
}

export interface ITokenProvider {
  getName(): string;
  getSupportedChains(): string[];
  getTokenInfo(params: TokenQueryParams): Promise<TokenInfo>;
  searchTokens(query: string, chain: string): Promise<TokenInfo[]>;
  isValidAddress(address: string, chain: string): Promise<boolean>;
}

export const TokenInfoSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  totalSupply: z.string().optional(),
  price: z.object({
    usd: z.number().optional(),
    nativeToken: z.number().optional(),
  }).optional(),
  marketCap: z.number().optional(),
  volume24h: z.number().optional(),
  priceChange24h: z.number().optional(),
  logoURI: z.string().optional(),
  verified: z.boolean().optional(),
}); 