import { NetworkName } from '@binkai/core';
import { z } from 'zod';

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

export interface IImageProvider {
  getName(): string;
  getSupportedNetworks(): NetworkName[];
}
