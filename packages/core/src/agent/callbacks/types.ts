import { DynamicStructuredTool } from '@langchain/core/tools';

/**
 * Represents the state of a tool execution
 */
export enum ToolExecutionState {
  STARTED = 'started',
  IN_PROCESS = 'in_process',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

/**
 * Data passed to callbacks during tool execution
 */
export interface ToolExecutionData {
  id: string;
  toolName: string;
  message: string;
  input: any;
  data?: any;
  error?: any;
  state: ToolExecutionState;
  timestamp: number;
  executionTime?: number; // in milliseconds, only available for COMPLETED and FAILED states
}

export interface HumanReviewData {
  toolName: string;
  data: any;
  timestamp: number;
}

/**
 * Callback interface for tool execution events
 */
export interface IToolExecutionCallback {
  /**
   * Called when a tool execution state changes
   * @param data Information about the tool execution
   */
  onToolExecution(data: ToolExecutionData): void | Promise<void>;
}

export interface IHumanReviewCallback {
  onHumanReview(data: HumanReviewData): void | Promise<void>;
}

/**
 * Configuration for agent callbacks
 */
export interface AgentCallbackConfig {
  toolExecutionCallbacks?: IToolExecutionCallback[];
}
