import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent } from '../types';

export interface IToolConfig {
  agent: IAgent;
}

export interface ITool {
  getName(config: IToolConfig): string;
  getDescription(config: IToolConfig): string;
  getSchema(config: IToolConfig): z.ZodObject<any>;
  createTool(config: IToolConfig): DynamicStructuredTool;
  setAgent(agent: IAgent): void;
} 