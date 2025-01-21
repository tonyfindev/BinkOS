import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIFunctionsAgent } from 'langchain/agents';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { BaseMessage, HumanMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { IWallet } from '../wallet/types';
import { NetworksConfig } from '../network/types';
import { AgentConfig, AgentExecuteParams, IAgent } from './types';
import { GetWalletAddressTool, SignMessageTool, ITool } from './tools';

export class Agent implements IAgent {
  private model: ChatOpenAI;
  private wallet: IWallet;
  private tools: DynamicStructuredTool[];
  private executor!: AgentExecutor;
  private toolImplementations: ITool[];
  private networks: NetworksConfig['networks'];

  constructor(config: AgentConfig, wallet: IWallet, networks: NetworksConfig['networks']) {
    this.wallet = wallet;
    this.networks = networks;
    this.model = new ChatOpenAI({
      modelName: config.model,
      temperature: config.temperature ?? 0,
      maxTokens: config.maxTokens,
    });

    this.toolImplementations = this.initializeTools();
    this.tools = this.createTools();
    this.initializeExecutor();
  }

  private initializeTools(): ITool[] {
    const tools = [
      new GetWalletAddressTool(),
      new SignMessageTool(),
    ];

    // Inject agent into tools
    tools.forEach(tool => tool.setAgent(this));

    return tools;
  }

  private createTools(): DynamicStructuredTool[] {
    return this.toolImplementations.map(tool => 
      tool.createTool({ agent: this })
    );
  }

  private async initializeExecutor(): Promise<void> {
    this.executor = await this.createExecutor();
  }

  private async createExecutor(): Promise<AgentExecutor> {
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", `You are a helpful blockchain agent with access to wallet functionality.
       You can help users interact with different blockchain networks.
       Available networks include: ${Object.keys(this.networks).join(', ')}`],
      new MessagesPlaceholder("chat_history"),
      ["human", "{input}"],
      new MessagesPlaceholder("agent_scratchpad"),
    ]);

    const agent = createOpenAIFunctionsAgent({
      llm: this.model,
      tools: this.tools,
      prompt,
    });

    return AgentExecutor.fromAgentAndTools({
      agent: await agent,
      tools: this.tools,
    });
  }

  public async execute(params: AgentExecuteParams): Promise<string> {
    // Wait for executor to be initialized if it hasn't been already
    if (!this.executor) {
      await this.initializeExecutor();
    }

    const messages: BaseMessage[] = params.history ?? [];
    messages.push(new HumanMessage(params.input));

    const result = await this.executor.invoke({
      input: params.input,
      chat_history: messages,
    });

    return result.output;
  }

  public getWallet(): IWallet {
    return this.wallet;
  }

  public getNetworks(): NetworksConfig['networks'] {
    return this.networks;
  }
} 