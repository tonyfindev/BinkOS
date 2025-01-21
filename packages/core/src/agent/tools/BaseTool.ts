import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent } from '../types';
import { ITool, IToolConfig } from './types';

export abstract class BaseTool implements ITool {
  protected agent!: IAgent;

  abstract getName(config: IToolConfig): string;
  abstract getDescription(config: IToolConfig): string;
  abstract getSchema(config: IToolConfig): z.ZodObject<any>;
  abstract createTool(config: IToolConfig): DynamicStructuredTool;

  setAgent(agent: IAgent): void {
    this.agent = agent;
  }

  protected getAgent(): IAgent {
    if (!this.agent) {
      throw new Error('Agent not initialized');
    }
    return this.agent;
  }
} 