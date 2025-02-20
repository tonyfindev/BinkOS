import { IAgent, AgentExecuteParams } from './types';
import { ITool } from './tools';
import { IPlugin } from '../plugin/types';
import { IWallet } from '../wallet/types';
import { NetworksConfig } from '../network/types';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { DatabaseAdapter } from '../storage';

export abstract class BaseAgent implements IAgent {
  protected tools: DynamicStructuredTool[] = [];
  protected plugins: Map<string, IPlugin> = new Map();

  async registerTool(tool: ITool): Promise<void> {
    tool.setAgent(this);
    this.tools.push(tool.createTool());
    await this.onToolsUpdated();
  }

  async registerPlugin(plugin: IPlugin): Promise<void> {
    // Initialize the plugin
    await plugin.initialize({});

    // Store the plugin
    const pluginName = plugin.getName();
    this.plugins.set(pluginName, plugin);

    // Register all tools from the plugin
    const tools = plugin.getTools();
    for (const tool of tools) {
      await this.registerTool(tool);
    }
  }

  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  protected async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (plugin) {
      // Cleanup plugin resources
      await plugin.cleanup();

      // Remove plugin
      this.plugins.delete(name);

      // Recreate tools array without this plugin's tools
      const pluginToolNames = new Set(plugin.getTools().map(t => t.getName()));
      this.tools = this.tools.filter(t => !pluginToolNames.has(t.name));

      await this.onToolsUpdated();
    }
  }

  protected getTools(): DynamicStructuredTool[] {
    return this.tools;
  }

  // Hook for subclasses to handle tool updates
  protected abstract onToolsUpdated(): Promise<void>;

  // Core agent functionality that must be implemented
  abstract execute(command: string): Promise<any>;
  abstract execute(params: AgentExecuteParams): Promise<string>;
  abstract getWallet(): IWallet;
  abstract getNetworks(): NetworksConfig['networks'];
  abstract registerDatabase(db: DatabaseAdapter): Promise<void>;
}
