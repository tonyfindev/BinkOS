import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent } from '../types';

export interface IToolConfig {}

export interface ITool {
  getName(): string;
  getDescription(): string;
  getSchema(): z.ZodObject<any>;
  createTool(): DynamicStructuredTool;
  setAgent(agent: IAgent): void;
}
