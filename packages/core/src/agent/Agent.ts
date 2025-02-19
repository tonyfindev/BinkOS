import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent, createOpenAIToolsAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { IWallet } from '../wallet/types';
import { NetworksConfig } from '../network/types';
import { AgentConfig, AgentExecuteParams, IAgent } from './types';
import { GetWalletAddressTool, ITool } from './tools';
import { BaseAgent } from './BaseAgent';
import { IPlugin } from '../plugin/types';

export class Agent extends BaseAgent {
  private model: ChatOpenAI;
  private wallet: IWallet;
  private executor!: AgentExecutor;
  private networks: NetworksConfig['networks'];
  private config: AgentConfig;

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    super();
    this.wallet = wallet;
    this.networks = networks;
    this.config = config;
    this.model = new ChatOpenAI({
      modelName: config.model,
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens,
    });

    this.initializeDefaultTools();
    this.initializeExecutor();
  }

  private initializeDefaultTools(): void {
    const defaultTools = [
      new GetWalletAddressTool({}),
    ];

    // Initialize default tools
    for (const tool of defaultTools) {
      this.registerTool(tool);
    }
  }

  async registerTool(tool: ITool): Promise<void> {
    tool.setAgent(this);
    this.tools.push(tool.createTool());
    this.initializeExecutor();
  }

  async registerPlugin(plugin: IPlugin): Promise<void> {
    const pluginName = plugin.getName();
    this.plugins.set(pluginName, plugin);

    // Register all tools from the plugin
    const tools = plugin.getTools();
    for (const tool of tools) {
      await this.registerTool(tool);
    }
    this.initializeExecutor();
  }

  getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  protected async unregisterPlugin(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (plugin) {
      await plugin.cleanup();
      this.plugins.delete(name);
      
      // Recreate tools array without this plugin's tools
      const pluginToolNames = new Set(plugin.getTools().map(t => t.getName()));
      this.tools = this.tools.filter(t => !pluginToolNames.has(t.name));
      
      // Reinitialize executor with updated tools
      await this.onToolsUpdated();
    }
  }

  protected async onToolsUpdated(): Promise<void> {
    await this.initializeExecutor();
  }

  private async initializeExecutor(): Promise<void> {
    this.executor = await this.createExecutor();
  }

  private async createExecutor(): Promise<AgentExecutor> {
    const supportedNetworkPrompt = `Available networks include: ${Object.keys(this.networks).join(', ')}`;

    const defaultSystemPrompt = `You are a helpful blockchain agent. You can help users interact with different blockchain networks.`;

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `${this.config.systemPrompt ?? defaultSystemPrompt}\n${supportedNetworkPrompt}`],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = createOpenAIToolsAgent({
      llm: this.model,
      tools: this.getTools(),
      prompt,
    });

    return AgentExecutor.fromAgentAndTools({
      agent: await agent,
      tools: this.getTools(),
    });
  }

  public async execute(commandOrParams: string | AgentExecuteParams): Promise<any> {
    // Wait for executor to be initialized if it hasn't been already
    if (!this.executor) {
      await this.initializeExecutor();
    }

    if (typeof commandOrParams === 'string') {
      const result = await this.executor.invoke({
        input: commandOrParams,
        chat_history: [],
      });
      return result.output;
    } else {
      const messages: BaseMessage[] = commandOrParams.history ?? [];
      messages.push(new HumanMessage(commandOrParams.input));

      const result = await this.executor.invoke({
        input: commandOrParams.input,
        chat_history: messages,
      });

      return result.output;
    }
  }

  public getWallet(): IWallet {
    return this.wallet;
  }

  public getNetworks(): NetworksConfig['networks'] {
    return this.networks;
  }
} 