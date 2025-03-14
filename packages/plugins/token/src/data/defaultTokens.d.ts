import { TokenInfo } from '../types';
import { NetworkName } from '@binkai/core';
export declare const defaultTokens: Partial<Record<NetworkName, Record<string, TokenInfo>>>;
export declare function getDefaultTokensForNetwork(network: NetworkName): Record<string, TokenInfo>;
export declare function getSupportedNetworks(): NetworkName[];
