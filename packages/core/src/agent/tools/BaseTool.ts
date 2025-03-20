import { DynamicStructuredTool, DynamicStructuredToolInput } from '@langchain/core/tools';
import { z } from 'zod';
import { IAgent, AgentNodeTypes } from '../types';
import { CustomDynamicStructuredTool, ITool, IToolConfig } from './types';

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
}
