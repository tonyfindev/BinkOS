import { NetworkName } from '@binkai/core';
import { z } from 'zod';

export interface TokenInfoSecurity {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  network: NetworkName; // The network this token belongs to
  totalSupply?: string;
  price?: {
    usd?: number;
    nativeToken?: number;
  };
  marketCap?: number;
  volume24h?: number;
  priceChange24h?: number;
  //logoURI?: string;
  verified?: boolean;
  top10HolderBalance: number;
  freezeAuthority: string;
  freezeable: boolean;
  nonTransferable: boolean;
  lockInfo: any;
  priceUpdatedAt?: number; // Timestamp when price was last updated
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  network: NetworkName; // The network this token belongs to
  totalSupply?: string;
  price?: {
    usd?: number;
    nativeToken?: number;
  };
  marketCap?: number;
  volume24h?: number;
  priceChange24h?: number;
  //logoURI?: string;
  verified?: boolean;
  priceUpdatedAt?: number;
}

export interface CreateTokenParams {
  name: string;
  symbol: string;
  description: string;
  img?: string;
  totalSupply?: number;
  raisedAmount?: number;
  saleRate?: number;
  network: NetworkName;
  amount?: number;
}

export interface TokenQueryParams {
  query: string; // Can be address or symbol
  network: NetworkName;
  includePrice?: boolean;
}

export interface ITokenProvider {
  getName(): string;
  getSupportedNetworks(): NetworkName[];
  getTokenInfo(params: TokenQueryParams): Promise<TokenInfo>;
  searchTokens(query: string, network: NetworkName): Promise<TokenInfo[]>;
  isValidAddress(address: string, network: NetworkName): Promise<boolean>;
}

export const TokenInfoSchema = z.object({
  address: z.string(),
  symbol: z.string(),
  name: z.string(),
  decimals: z.number(),
  network: z.nativeEnum(NetworkName),
  totalSupply: z.string().optional(),
  price: z
    .object({
      usd: z.number().optional(),
      nativeToken: z.number().optional(),
    })
    .optional(),
  marketCap: z.number().optional(),
  volume24h: z.number().optional(),
  priceChange24h: z.number().optional(),
  //logoURI: z.string().optional(),
  verified: z.boolean().optional(),
  priceUpdatedAt: z.number().optional(),
});
