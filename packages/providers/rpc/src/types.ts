import { NetworkName } from '@binkai/core';

export const GAS_BUFFER = {
  [NetworkName.SOLANA]: BigInt(1000000), // 0.0001 SOL in lamports
};
