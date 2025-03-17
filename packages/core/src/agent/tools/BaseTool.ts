import { DynamicStructuredTool, DynamicStructuredToolInput } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent } from '../types';
import { CustomDynamicStructuredTool, ITool, IToolConfig } from './types';
import {
  StructuredError,
  createStructuredError,
  logStructuredError,
  generateEnhancedSuggestion,
  ToolType,
  ErrorStep,
} from '../../utils';

export abstract class BaseTool implements ITool {
  protected agent!: IAgent;
  protected config: IToolConfig;

  constructor(config: IToolConfig) {
    this.config = config;
  }

  abstract getName(): string;
  abstract getDescription(): string;
  abstract getSchema(): z.ZodObject<any>;
  abstract createTool(): CustomDynamicStructuredTool;

  setAgent(agent: IAgent): void {
    this.agent = agent;
  }

  protected getToolType(): ToolType {
    const name = this.getName();

    if (name.includes('wallet') || name.includes('balance')) {
      return ToolType.WALLET_BALANCE;
    } else if (name.includes('token') || name.includes('info')) {
      return ToolType.TOKEN_INFO;
    } else if (name.includes('swap')) {
      return ToolType.SWAP;
    }

    return ToolType.AGENT;
  }

  /**
   * Create a structured error
   */
  protected createError(
    step: ErrorStep | string,
    message: string,
    details: Record<string, any> = {},
  ): StructuredError {
    return createStructuredError(step, message, details);
  }

  /**
   * Log a structured error
   */
  protected logError(
    error: StructuredError | Error | unknown,
    level: 'error' | 'warn' | 'info' = 'error',
  ): void {
    logStructuredError(`${this.getName()} Tool`, error, level);
  }

  /**
   * Generate enhanced suggestion for errors
   */
  protected generateSuggestion(structuredError: StructuredError, commandOrParams?: any): string {
    return generateEnhancedSuggestion(structuredError, {
      toolType: this.getToolType(),
      commandOrParams,
    });
  }

  /**
   * Format error response as JSON
   */
  protected formatErrorResponse(structuredError: StructuredError, args: any): string {
    const errorStep = structuredError.step;
    const suggestion = this.generateSuggestion(structuredError, args);

    return JSON.stringify({
      status: 'error',
      tool: this.getName(),
      toolType: this.getToolType(),
      process: this.getProcessName(),
      errorStep: errorStep,
      processStage:
        errorStep.replace(/_/g, ' ').charAt(0).toUpperCase() +
        errorStep.replace(/_/g, ' ').slice(1),
      message: structuredError.message,
      details: structuredError.details,
      suggestion: suggestion,
      parameters: args,
    });
  }

  /**
   * Get the process name for error context
   */
  protected getProcessName(): string {
    const name = this.getName();

    if (name.includes('wallet') || name.includes('balance')) {
      return 'balance_retrieval';
    } else if (name.includes('token') || name.includes('info')) {
      return 'token_data_retrieval';
    } else if (name.includes('swap')) {
      return 'token_swap';
    }

    return 'tool_execution';
  }

  /**
   * Handle errors in a standardized way
   */
  protected handleError(error: any, args: any): string {
    this.logError(error);

    // Determine error type and structure response accordingly
    let structuredError: StructuredError;

    if (typeof error === 'object' && error !== null && 'step' in error) {
      // Already a structured error
      structuredError = error as StructuredError;
    } else if (error instanceof Error) {
      // Standard Error object
      structuredError = this.createError(ErrorStep.EXECUTION, error.message, {
        error: error.message,
      });
    } else {
      // Other error types
      structuredError = this.createError(ErrorStep.UNKNOWN, String(error), {
        error: String(error),
      });
    }

    return this.formatErrorResponse(structuredError, args);
  }
}
