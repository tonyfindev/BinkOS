/**
 * Validates an EVM address format
 * @param address The address to validate
 * @returns boolean indicating if the address is valid
 */
export function isValidEVMAddress(address: string): boolean {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
}

/**
 * Validates a Solana address format
 * @param address The address to validate
 * @returns boolean indicating if the address is valid
 */
export function isValidSolanaAddress(address: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
}

/**
 * Validates a token address based on the chain type
 * @param address The token address to validate
 * @param chain The blockchain network (e.g., 'solana', 'eth', 'bnb')
 * @returns boolean indicating if the address is valid for the specified chain
 */
export function validateTokenAddress(
  address: string,
  chain: string,
): { isValid: boolean; address: string } {
  let validAddress = address;
  // Solana chains
  if (chain === 'solana') {
    return {
      isValid: isValidSolanaAddress(address),
      address: validAddress,
    };
  } else if (
    chain !== 'solana' &&
    address.toLowerCase() === '0x0000000000000000000000000000000000000000'
  ) {
    validAddress = '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
    return {
      isValid: isValidEVMAddress(validAddress),
      address: validAddress,
    };
  }
  // EVM chains (eth, bnb, etc.)
  return {
    isValid: isValidEVMAddress(address),
    address: validAddress,
  };
}
