/**
 * Standard interface for structured errors across all tools
 */
export interface StructuredError {
  step: string;
  message: string;
  details: Record<string, any>;
}

/**
 * Error types that can be used across different tools
 */
export enum ErrorStep {
  NETWORK_VALIDATION = 'network_validation',
  WALLET_ACCESS = 'wallet_access',
  PROVIDER_AVAILABILITY = 'provider_availability',
  DATA_RETRIEVAL = 'data_retrieval',
  TOKEN_NOT_FOUND = 'token_not_found',
  PRICE_RETRIEVAL = 'price_retrieval',
  PROVIDER_VALIDATION = 'provider_validation',
  INITIALIZATION = 'initialization',
  EXECUTION = 'execution',
  REASONING = 'reasoning',
  DATABASE = 'database',
  TOOL_EXECUTION = 'tool_execution',
  UNKNOWN = 'unknown',
}

/**
 * Tool types for error context
 */
export enum ToolType {
  WALLET_BALANCE = 'wallet_balance',
  TOKEN_INFO = 'token_info',
  SWAP = 'swap',
  AGENT = 'agent',
}

/**
 * Creates a structured error object
 */
export function createStructuredError(
  step: string,
  message: string,
  details: Record<string, any> = {},
): StructuredError {
  return {
    step,
    message,
    details,
  };
}

/**
 * Logs a structured error to the console
 */
export function logStructuredError(
  source: string,
  error: StructuredError | Error | unknown,
  level: 'error' | 'warn' | 'info' = 'error',
): void {
  let structuredError: StructuredError;

  if (typeof error === 'object' && error !== null && 'step' in error) {
    structuredError = error as StructuredError;
  } else if (error instanceof Error) {
    structuredError = {
      step: ErrorStep.EXECUTION,
      message: error.message,
      details: { error: error.message },
    };
  } else {
    structuredError = {
      step: ErrorStep.UNKNOWN,
      message: String(error),
      details: { error: String(error) },
    };
  }

  const logMethod =
    level === 'error' ? console.error : level === 'warn' ? console.warn : console.info;

  logMethod(`${source}:`, JSON.stringify(structuredError));
}
