/**
 * Utility functions for formatting token data
 */

/**
 * Rounds a number to a specific number of decimal places with intelligent formatting
 * based on the magnitude of the number.
 *
 * @param value The number to round
 * @param decimals The number of decimal places to round to (default: 2)
 * @returns The rounded number or undefined if the input is undefined
 */
export function roundNumber(
  value: number | null | undefined,
  decimals: number = 2,
): number | undefined {
  if (value === undefined || value === null) return undefined;
  return Number(value.toFixed(decimals));

  //   // Handle different value ranges differently
  //   if (Math.abs(value) >= 1000000000) {
  //     // For values >= 1 billion, round to 2 decimals and divide by 1 billion
  //     return Math.round(value / 10000000) / 100;
  //   } else if (Math.abs(value) >= 1000000) {
  //     // For values >= 1 million, round to 2 decimals and divide by 1 million
  //     return Math.round(value / 10000) / 100;
  //   } else if (Math.abs(value) >= 1000) {
  //     // For values >= 1000, round to 2 decimals
  //     return Math.round(value * 100) / 100;
  //   } else if (Math.abs(value) >= 1) {
  //     // For values >= 1, round to specified decimals
  //     const factor = Math.pow(10, decimals);
  //     return Math.round(value * factor) / factor;
  //   } else if (Math.abs(value) >= 0.0001) {
  //     // For small values, use more decimals
  //     return Math.round(value * 10000) / 10000;
  //   } else {
  //     // For very small values, use scientific notation
  //     return Number(value.toExponential(4));
  //   }
}

/**
 * Formats a price value for display with appropriate currency symbol
 *
 * @param price The price value to format
 * @param currency The currency symbol to use (default: '$')
 * @returns Formatted price string or undefined if price is undefined
 */
export function formatPrice(price: number | undefined, currency: string = '$'): string | undefined {
  if (price === undefined) return undefined;

  const roundedPrice = roundNumber(price, 6);
  if (roundedPrice === undefined) return undefined;

  // Format based on magnitude
  if (Math.abs(roundedPrice) >= 1000000000) {
    return `${currency}${(roundedPrice / 1000000000).toFixed(2)}B`;
  } else if (Math.abs(roundedPrice) >= 1000000) {
    return `${currency}${(roundedPrice / 1000000).toFixed(2)}M`;
  } else if (Math.abs(roundedPrice) >= 1000) {
    return `${currency}${roundedPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  } else if (Math.abs(roundedPrice) >= 1) {
    return `${currency}${roundedPrice.toFixed(2)}`;
  } else if (Math.abs(roundedPrice) >= 0.01) {
    return `${currency}${roundedPrice.toFixed(4)}`;
  } else if (Math.abs(roundedPrice) >= 0.0001) {
    return `${currency}${roundedPrice.toFixed(6)}`;
  } else {
    return `${currency}${roundedPrice.toExponential(4)}`;
  }
}

/**
 * Formats a percentage value for display
 *
 * @param value The percentage value to format
 * @returns Formatted percentage string or undefined if value is undefined
 */
export function formatPercentage(value: number | undefined): string | undefined {
  if (value === undefined) return undefined;

  const roundedValue = roundNumber(value, 2);
  if (roundedValue === undefined) return undefined;

  return `${roundedValue > 0 ? '+' : ''}${roundedValue.toFixed(2)}%`;
}

/**
 * Formats a volume or market cap value for display
 *
 * @param value The value to format
 * @param currency The currency symbol to use (default: '$')
 * @returns Formatted value string or undefined if value is undefined
 */
export function formatVolume(
  value: number | undefined,
  currency: string = '$',
): string | undefined {
  if (value === undefined) return undefined;

  const roundedValue = roundNumber(value, 2);
  if (roundedValue === undefined) return undefined;

  // Format based on magnitude
  if (Math.abs(roundedValue) >= 1000000000) {
    return `${currency}${(roundedValue / 1000000000).toFixed(2)}B`;
  } else if (Math.abs(roundedValue) >= 1000000) {
    return `${currency}${(roundedValue / 1000000).toFixed(2)}M`;
  } else if (Math.abs(roundedValue) >= 1000) {
    return `${currency}${(roundedValue / 1000).toFixed(2)}K`;
  } else {
    return `${currency}${roundedValue.toFixed(2)}`;
  }
}
