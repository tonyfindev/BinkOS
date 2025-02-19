import { IAgent } from '../agent/types';
import { BaseTool } from '../agent/tools/BaseTool';

export interface IPluginConfig {
  [key: string]: any;
}

export interface IPlugin {
  /**
   * Get the name of the plugin
   */
  getName(): string;

  /**
   * Initialize the plugin with configuration
   */
  initialize(config: IPluginConfig): Promise<void>;

  /**
   * Register the plugin with an agent
   */
  register(agent: IAgent): Promise<void>;

  /**
   * Get all tools provided by this plugin
   */
  getTools(): BaseTool[];

  /**
   * Clean up any resources when plugin is unregistered
   */
  cleanup(): Promise<void>;
}
