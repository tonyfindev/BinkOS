import { NetworkName } from '@binkai/core';
import { z } from 'zod';
export interface TokenInfo {
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    network: NetworkName;
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
    priceUpdatedAt?: number;
}
export interface TokenQueryParams {
    query: string;
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
export declare const TokenInfoSchema: z.ZodObject<{
    address: z.ZodString;
    symbol: z.ZodString;
    name: z.ZodString;
    decimals: z.ZodNumber;
    network: z.ZodNativeEnum<typeof NetworkName>;
    totalSupply: z.ZodOptional<z.ZodString>;
    price: z.ZodOptional<z.ZodObject<{
        usd: z.ZodOptional<z.ZodNumber>;
        nativeToken: z.ZodOptional<z.ZodNumber>;
    }, "strip", z.ZodTypeAny, {
        usd?: number | undefined;
        nativeToken?: number | undefined;
    }, {
        usd?: number | undefined;
        nativeToken?: number | undefined;
    }>>;
    marketCap: z.ZodOptional<z.ZodNumber>;
    volume24h: z.ZodOptional<z.ZodNumber>;
    priceChange24h: z.ZodOptional<z.ZodNumber>;
    logoURI: z.ZodOptional<z.ZodString>;
    verified: z.ZodOptional<z.ZodBoolean>;
    priceUpdatedAt: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    symbol: string;
    decimals: number;
    address: string;
    network: NetworkName;
    name: string;
    totalSupply?: string | undefined;
    price?: {
        usd?: number | undefined;
        nativeToken?: number | undefined;
    } | undefined;
    marketCap?: number | undefined;
    volume24h?: number | undefined;
    priceChange24h?: number | undefined;
    logoURI?: string | undefined;
    verified?: boolean | undefined;
    priceUpdatedAt?: number | undefined;
}, {
    symbol: string;
    decimals: number;
    address: string;
    network: NetworkName;
    name: string;
    totalSupply?: string | undefined;
    price?: {
        usd?: number | undefined;
        nativeToken?: number | undefined;
    } | undefined;
    marketCap?: number | undefined;
    volume24h?: number | undefined;
    priceChange24h?: number | undefined;
    logoURI?: string | undefined;
    verified?: boolean | undefined;
    priceUpdatedAt?: number | undefined;
}>;
