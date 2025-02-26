import { ITokenProvider, TokenInfo, TokenQueryParams } from '../types';
import { getDefaultTokensForNetwork, getSupportedNetworks } from '../data/defaultTokens';
import { NetworkName } from '@binkai/core';

/**
 * Default token provider that uses a predefined list of tokens
 */
export class DefaultTokenProvider implements ITokenProvider {
  private tokensBySymbol: Map<NetworkName, Map<string, TokenInfo>> = new Map();
  private tokensByAddress: Map<NetworkName, Map<string, TokenInfo>> = new Map();

  constructor() {
    this.initialize();
  }

  private initialize() {
    // Create a symbol-based lookup map for each network
    for (const network of getSupportedNetworks()) {
      const tokens = getDefaultTokensForNetwork(network);

      // Initialize maps for this network
      const symbolMap = new Map<string, TokenInfo>();
      const addressMap = new Map<string, TokenInfo>();

      // Populate maps
      Object.values(tokens).forEach(token => {
        symbolMap.set(token.symbol.toLowerCase(), token);
        addressMap.set(token.address.toLowerCase(), token);
      });

      this.tokensBySymbol.set(network, symbolMap);
      this.tokensByAddress.set(network, addressMap);
    }
  }

  getName(): string {
    return 'DefaultTokenProvider';
  }

  getSupportedNetworks(): NetworkName[] {
    return getSupportedNetworks();
  }

  private normalizeAddress(address: string, network: NetworkName): string {
    // For Solana, addresses are case-sensitive
    return this.isSolanaNetwork(network) ? address : address.toLowerCase();
  }

  async getTokenInfo(params: TokenQueryParams): Promise<TokenInfo> {
    const { query, network } = params;

    if (!network) {
      throw new Error('Network is required to get token info');
    }

    if (!this.tokensByAddress.has(network)) {
      throw new Error(`Network ${network} not supported by DefaultTokenProvider`);
    }

    // Check if it's an address
    const normalizedInput = this.normalizeAddress(query, network);
    const addressMap = this.tokensByAddress.get(network)!;

    if (addressMap.has(normalizedInput)) {
      return addressMap.get(normalizedInput)!;
    }

    // Check if it's a symbol
    const symbolMap = this.tokensBySymbol.get(network)!;
    const normalizedSymbol = query.toLowerCase();

    if (symbolMap.has(normalizedSymbol)) {
      return symbolMap.get(normalizedSymbol)!;
    }

    throw new Error(`Token ${query} not found in default token list for network ${network}`);
  }

  async searchTokens(query: string, network: NetworkName): Promise<TokenInfo[]> {
    if (!network || !this.tokensBySymbol.has(network)) {
      return [];
    }

    const normalizedQuery = query.toLowerCase();
    const results: TokenInfo[] = [];

    // Search by symbol and name
    const symbolMap = this.tokensBySymbol.get(network)!;
    const addressMap = this.tokensByAddress.get(network)!;

    // Combine all tokens for this network
    const allTokens = Array.from(addressMap.values());

    for (const token of allTokens) {
      if (
        token.symbol.toLowerCase().includes(normalizedQuery) ||
        token.name.toLowerCase().includes(normalizedQuery) ||
        token.address.toLowerCase().includes(normalizedQuery)
      ) {
        results.push(token);
      }
    }

    return results;
  }

  private isSolanaNetwork(network: NetworkName): boolean {
    return network === NetworkName.SOLANA || network === NetworkName.SOLANA_DEVNET;
  }

  async isValidAddress(address: string, network: NetworkName): Promise<boolean> {
    if (!network) {
      return false;
    }

    // For Solana, addresses are 32-44 characters long and can contain any alphanumeric character
    if (this.isSolanaNetwork(network)) {
      return /^[A-Za-z0-9]{32,44}$/.test(address);
    }

    // For EVM chains, addresses are 42 characters long (including 0x) and contain only hex characters
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }
}
