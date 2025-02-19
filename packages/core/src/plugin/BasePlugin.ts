import { IAgent } from '../agent/types';
import { BaseTool } from '../agent/tools/BaseTool';
import { IPlugin, IPluginConfig } from './types';

export abstract class BasePlugin implements IPlugin {
  protected agent?: IAgent;
  protected config: IPluginConfig = {};
  protected tools: BaseTool[] = [];

  abstract getName(): string;

  async initialize(config: IPluginConfig): Promise<void> {
    this.config = config;
  }

  async register(agent: IAgent): Promise<void> {
    this.agent = agent;
    const tools = this.getTools();
    for (const tool of tools) {
      tool.setAgent(agent);
      await agent.registerTool(tool);
    }
  }

  getTools(): BaseTool[] {
    return this.tools;
  }

  async cleanup(): Promise<void> {
    // Cleanup implementation can be added by child classes
  }

  protected getAgent(): IAgent {
    if (!this.agent) {
      throw new Error('Plugin not registered with an agent');
    }
    return this.agent;
  }
}
