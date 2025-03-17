import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent } from '../types';
import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { RunnableConfig } from '@langchain/core/runnables';

export interface ToolProgress {
  progress: number;
  data?: Record<string, any>;
  message: string;
}

export interface CustomDynamicStructuredTool {
  name: string;
  description: string;
  func: (
    args: any,
    runManager?: CallbackManagerForToolRun,
    config?: RunnableConfig,
    onProgress?: (data: ToolProgress) => void,
  ) => Promise<string>;
  schema: z.ZodObject<any>;
  returnDirect?: boolean;
}

export interface IToolConfig {}

export interface ITool {
  getName(): string;
  getDescription(): string;
  getSchema(): z.ZodObject<any>;
  createTool(): CustomDynamicStructuredTool;
  setAgent(agent: IAgent): void;
}
