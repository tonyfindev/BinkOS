import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent } from '../types';
import { ITool, IToolConfig } from './types';

export abstract class BaseTool implements ITool {
  protected agent!: IAgent;
  protected config: IToolConfig;

  constructor(config: IToolConfig) {
    this.config = config;
  }

  abstract getName(): string;
  abstract getDescription(): string;
  abstract getSchema(): z.ZodObject<any>;
  abstract createTool(): DynamicStructuredTool<z.ZodObject<any>>;

  setAgent(agent: IAgent): void {
    this.agent = agent;
  }
} 