import { StructuredError, ErrorStep, ToolType } from './StructuredError';

/**
 * Configuration for suggestion generation
 */
export interface SuggestionConfig {
  toolType: ToolType;
  errorPrefix?: string;
  commandOrParams?: any;
}

/**
 * Generates enhanced error suggestions based on the tool type and error
 */
export function generateEnhancedSuggestion(
  structuredError: StructuredError,
  config: SuggestionConfig
): string {
  const { toolType, errorPrefix: customPrefix, commandOrParams } = config;
  
  // Get the appropriate error prefix based on tool type
  const errorPrefix = customPrefix || getDefaultErrorPrefix(toolType);
  const errorStep = structuredError.step;
  
  // Generate suggestions based on tool type and error step
  switch (toolType) {
    case ToolType.WALLET_BALANCE:
      return generateWalletBalanceSuggestion(errorStep, structuredError, errorPrefix, commandOrParams);
    
    case ToolType.TOKEN_INFO:
      return generateTokenInfoSuggestion(errorStep, structuredError, errorPrefix, commandOrParams);
    
    case ToolType.SWAP:
      return generateSwapSuggestion(errorStep, structuredError, errorPrefix, commandOrParams);
    
    case ToolType.AGENT:
      return generateAgentSuggestion(errorStep, structuredError, errorPrefix, commandOrParams);
    
    default:
      // Generic suggestion for unknown tool types
      const suggestion = `${errorPrefix}Operation failed: ${structuredError.message}`;
      const alternativeActions = [
        'Try a different command',
        'Check your input parameters',
        'Try again later'
      ];
      return formatSuggestion(suggestion, errorStep, alternativeActions);
  }
}

/**
 * Get default error prefix based on tool type
 */
function getDefaultErrorPrefix(toolType: ToolType): string {
  switch (toolType) {
    case ToolType.WALLET_BALANCE:
      return '[Wallet Balance Tool Error] ';
    case ToolType.TOKEN_INFO:
      return '[Token Info Tool Error] ';
    case ToolType.SWAP:
      return '[Swap Tool Error] ';
    case ToolType.AGENT:
      return '[Agent Error] ';
    default:
      return '[Tool Error] ';
  }
}

/**
 * Format the suggestion with process information and alternative actions
 */
function formatSuggestion(
  suggestion: string,
  errorStep: string,
  alternativeActions: string[]
): string {
  let enhancedSuggestion = `${suggestion}\n\n`;
  
  // Add process information
  const formattedStep = errorStep.replace(/_/g, ' ');
  const capitalizedStep = formattedStep.charAt(0).toUpperCase() + formattedStep.slice(1);
  enhancedSuggestion += `**Process Stage:** ${capitalizedStep}\n\n`;
  
  // Add alternative actions
  if (alternativeActions.length > 0) {
    enhancedSuggestion += `**Suggested actions you can try:**\n`;
    alternativeActions.forEach(action => {
      enhancedSuggestion += `- ${action}\n`;
    });
  }
  
  return enhancedSuggestion;
}

/**
 * Generate suggestions for Wallet Balance Tool errors
 */
function generateWalletBalanceSuggestion(
  errorStep: string,
  structuredError: StructuredError,
  errorPrefix: string,
  args: any
): string {
  let suggestion = '';
  let alternativeActions: string[] = [];
  
  switch (errorStep) {
    case ErrorStep.NETWORK_VALIDATION:
      const networks = structuredError.details.supportedNetworks || [];
      suggestion = `${errorPrefix}Network validation failed: "${structuredError.details.requestedNetwork}" is not supported for wallet balance queries. Please use one of these networks: ${networks.join(', ')}.`;
      
      alternativeActions = [
        `Try with a supported network, e.g., "check my balance on ${networks[0] || 'bnb'}"`,
        `List supported networks: "show supported networks for wallet balance"`
      ];
      break;
      
    case ErrorStep.WALLET_ACCESS:
      suggestion = `${errorPrefix}Wallet address retrieval failed: Could not access wallet address for the ${structuredError.details.network} network. Please ensure your wallet is properly connected and supports this network, or provide an address explicitly.`;
      
      alternativeActions = [
        `Provide an address explicitly: "check balance of [wallet_address] on ${structuredError.details.network}"`,
        `Try a different network: "check my balance on [different_network]"`,
        `View your wallet addresses: "show my wallet addresses"`
      ];
      break;
      
    case ErrorStep.PROVIDER_AVAILABILITY:
      const supportedNets = structuredError.details.supportedNetworks || [];
      suggestion = `${errorPrefix}Provider availability issue: No data providers available for the ${structuredError.details.network} network. This tool supports: ${supportedNets.join(', ')}.`;
      
      alternativeActions = [
        `Try a supported network: "check my balance on ${supportedNets[0] || 'supported_network'}"`,
        `List available providers: "show wallet data providers"`
      ];
      break;
      
    case ErrorStep.DATA_RETRIEVAL:
      suggestion = `${errorPrefix}Data retrieval failed: Could not get wallet information for address ${structuredError.details.address} on ${structuredError.details.network} network. The address may be invalid, have no activity, or the network may be experiencing issues.`;
      
      alternativeActions = [
        `Verify the address is correct: "verify address ${structuredError.details.address}"`,
        `Try a different network: "check balance on [different_network]"`,
        `Check network status: "check status of ${structuredError.details.network} network"`
      ];
      break;
      
    default:
      suggestion = `${errorPrefix}Wallet balance query failed: An unexpected error occurred while retrieving wallet information. Please check your input parameters and try again.`;
      
      alternativeActions = [
        `Try with a different network: "check my balance on [network]"`,
        `Provide a specific address: "check balance of [address] on [network]"`
      ];
  }
  
  return formatSuggestion(suggestion, errorStep, alternativeActions);
}

/**
 * Generate suggestions for Token Info Tool errors
 */
function generateTokenInfoSuggestion(
  errorStep: string,
  structuredError: StructuredError,
  errorPrefix: string,
  args: any
): string {
  // Simplified implementation
  const suggestion = `${errorPrefix}Token info error: ${structuredError.message}`;
  const alternativeActions = ['Try a different token', 'Check the network'];
  return formatSuggestion(suggestion, errorStep, alternativeActions);
}

/**
 * Generate suggestions for Swap Tool errors
 */
function generateSwapSuggestion(
  errorStep: string,
  structuredError: StructuredError,
  errorPrefix: string,
  args: any
): string {
  // Simplified implementation
  const suggestion = `${errorPrefix}Swap error: ${structuredError.message}`;
  const alternativeActions = ['Try a different token pair', 'Check your balance'];
  return formatSuggestion(suggestion, errorStep, alternativeActions);
}

/**
 * Generate suggestions for Agent errors
 */
function generateAgentSuggestion(
  errorStep: string,
  structuredError: StructuredError,
  errorPrefix: string,
  commandOrParams: any
): string {
  // Simplified implementation
  const suggestion = `${errorPrefix}Agent error: ${structuredError.message}`;
  const alternativeActions = ['Try a different command', 'Check your wallet connection'];
  return formatSuggestion(suggestion, errorStep, alternativeActions);
}