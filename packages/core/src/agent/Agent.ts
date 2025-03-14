import { ChatOpenAI } from '@langchain/openai';
import { AgentExecutor, createOpenAIToolsAgent } from 'langchain/agents';
import { BaseMessage, HumanMessage, AIMessage } from '@langchain/core/messages';
import { ChatPromptTemplate, MessagesPlaceholder } from '@langchain/core/prompts';
import { IWallet } from '../wallet/types';
import { NetworkName, NetworksConfig } from '../network/types';
import { AgentConfig, AgentContext, AgentExecuteParams, IAgent } from './types';
import { GetWalletAddressTool, ITool } from './tools';
import { BaseAgent } from './BaseAgent';
import { IPlugin } from '../plugin/types';
import { DatabaseAdapter } from '../storage';
import { MessageEntity } from '../types';
import { EVM_NATIVE_TOKEN_ADDRESS, SOL_NATIVE_TOKEN_ADDRESS } from '../network';
import { CallbackManager, IToolExecutionCallback } from './callbacks';

// Define the StructuredError interface
interface StructuredError {
  step: string;
  message: string;
  details: Record<string, any>;
}

export class Agent extends BaseAgent {
  private model: ChatOpenAI;
  private wallet: IWallet;
  private executor!: AgentExecutor;
  private networks: NetworksConfig['networks'];
  private db: DatabaseAdapter<any> | undefined;
  private context: AgentContext = {};
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
  }

  getContext(): AgentContext {
    return this.context;
  }

  async initialize() {
    await this.initializeContext();
    await this.initializeExecutor();
  }

  private initializeDefaultTools(): void {
    const defaultTools = [new GetWalletAddressTool({})];

    // Initialize default tools
    for (const tool of defaultTools) {
      this.registerTool(tool);
    }
  }

  async registerTool(tool: ITool): Promise<void> {
    tool.setAgent(this);
    const dynamicTool = tool.createTool();

    // Wrap the tool with our callback system
    const wrappedTool = this.callbackManager.wrapTool(dynamicTool);

    this.tools.push(wrappedTool);
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

  // initialize all plugins at once with all tools in the plugins
  async registerListPlugins(plugins: IPlugin[]): Promise<void> {
    for (const plugin of plugins) {
      const pluginName = plugin.getName();
      this.plugins.set(pluginName, plugin);
      const tools = plugin.getTools();
      for (const tool of tools) {
        await this.registerTool(tool);
      }
    }
    console.log('✓ Plugins registered\n');
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

  async registerDatabase(database: DatabaseAdapter<any> | undefined): Promise<void> {
    try {
      if (database) {
        this.db = database;
        await this.db.init();
        console.info('✓ Database initialized\n');
      }
    } catch (error) {
      console.error('Failed to connect to Postgres:', error);
      throw error; // Re-throw to handle it in the calling code
    }
  }

  async initializeContext(): Promise<AgentContext> {
    if (this.db) {
      const networkNames = Object.keys(this.networks);
      if (networkNames.length) {
        const defaultNetwork = networkNames[0] as NetworkName;
        const address = await this.wallet?.getAddress(defaultNetwork);
        if (!address) throw new Error('Not found wallet address');
        const user = await this.db.createAndGetUserByAddress({ address });
        this.context.user = user;
      }
    }
    return this.context;
  }

  private async createExecutor(): Promise<AgentExecutor> {
    const requiredPrompt = `
    Native token address: 
    - EVM (${Object.values(this.networks)
      .filter(network => network.type === 'evm')
      .map(network => network.config.name)
      .join(', ')}): ${EVM_NATIVE_TOKEN_ADDRESS}
    - Solana: ${SOL_NATIVE_TOKEN_ADDRESS}
    Available networks include: ${Object.keys(this.networks).join(', ')}`;

    const defaultSystemPrompt = `You are a helpful blockchain agent. You can help users interact with different blockchain networks.`;

    const prompt = ChatPromptTemplate.fromMessages([
      ['system', `${this.config.systemPrompt ?? defaultSystemPrompt}\n${requiredPrompt}`],
      new MessagesPlaceholder('chat_history'),
      ['human', '{input}'],
      new MessagesPlaceholder('agent_scratchpad'),
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

  // Simplified suggestion generator function for Agent
  private generateEnhancedSuggestion(
    errorStep: string,
    structuredError: StructuredError,
    command: string | AgentExecuteParams,
  ): string {
    let suggestion = '';
    let alternativeActions: string[] = [];

    // Prefix to clearly indicate this is an Agent error
    const errorPrefix = `[Agent Error] `;

    switch (errorStep) {
      case 'initialization':
        suggestion = `${errorPrefix}Agent initialization failed: The agent could not be properly initialized. ${structuredError.message}`;

        alternativeActions = [
          `Try restarting the agent`,
          `Check if the wallet is properly connected`,
          `Verify network configurations`,
        ];
        break;

      case 'wallet_access':
        suggestion = `${errorPrefix}Wallet access failed: Could not access the wallet to perform this operation. ${structuredError.message}`;

        alternativeActions = [
          `Check if your wallet is properly connected`,
          `Try reconnecting your wallet`,
          `Verify that you have the correct permissions`,
        ];
        break;

      case 'tool_execution':
        suggestion = `${errorPrefix}Tool execution failed: The agent encountered an error while executing a tool. ${structuredError.message}`;

        alternativeActions = [
          `Try a simpler command`,
          `Check the parameters you provided`,
          `Try a different approach to accomplish your goal`,
        ];
        break;

      case 'reasoning':
        suggestion = `${errorPrefix}AI reasoning failed: The agent could not properly reason about your request. ${structuredError.message}`;

        alternativeActions = [
          `Try rephrasing your request more clearly`,
          `Break down your request into smaller steps`,
          `Provide more specific information about what you want to accomplish`,
        ];
        break;

      case 'database':
        suggestion = `${errorPrefix}Database operation failed: Could not store or retrieve conversation history. ${structuredError.message}`;

        alternativeActions = [
          `Continue with your request (your current conversation will work, but might not be saved)`,
          `Try again later when the database service might be available`,
        ];
        break;

      default:
        suggestion = `${errorPrefix}Execution failed: An unexpected error occurred while processing your request. ${structuredError.message}`;

        alternativeActions = [
          `Try a simpler request`,
          `Break down your request into smaller steps`,
          `Try again with more specific instructions`,
        ];
    }

    // Create enhanced suggestion with alternative actions
    let enhancedSuggestion = `${suggestion}\n\n`;

    // Add process information
    enhancedSuggestion += `**Agent Process Stage:** ${errorStep.replace('_', ' ').charAt(0).toUpperCase() + errorStep.replace('_', ' ').slice(1)}\n\n`;

    // Add alternative actions
    if (alternativeActions.length > 0) {
      enhancedSuggestion += `**Suggested actions you can try:**\n`;
      alternativeActions.forEach(action => {
        enhancedSuggestion += `- ${action}\n`;
      });
    }

    return enhancedSuggestion;
  }

  async execute(commandOrParams: string | AgentExecuteParams): Promise<any> {
    try {
      // STEP 1: Check if executor is initialized
      if (!this.executor) {
        try {
          await this.initializeExecutor();
        } catch (error) {
          const structuredError = {
            step: 'initialization',
            message: 'Failed to initialize agent executor.',
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          };
          console.error('Agent error:', JSON.stringify(structuredError));
          throw structuredError;
        }
      }

      // STEP 2: Check if context is initialized
      if (!Object.keys(this.context).length) {
        try {
          await this.initializeContext();
        } catch (error) {
          const structuredError = {
            step: 'initialization',
            message: 'Failed to initialize agent context.',
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          };
          console.error('Agent error:', JSON.stringify(structuredError));
          throw structuredError;
        }
      }

      let _history: MessageEntity[] = [];

      // STEP 3: Retrieve conversation history
      if (this.db) {
        try {
          if (typeof commandOrParams === 'string') {
            if (this.context?.user?.id) {
              _history = await this.db?.getMessagesByUserId(this.context?.user?.id);
            }
          } else {
            if (commandOrParams?.threadId) {
              _history = await this.db?.getMessagesByThreadId(commandOrParams?.threadId);
            }
          }
        } catch (error) {
          const structuredError = {
            step: 'database',
            message: 'Error retrieving message history.',
            details: {
              error: error instanceof Error ? error.message : String(error),
            },
          };
          console.warn('Database warning:', JSON.stringify(structuredError));
          // Continue execution even if history retrieval fails
        }
      }

      const history = _history.map((message: MessageEntity) =>
        message?.message_type === 'human'
          ? new HumanMessage(message?.content)
          : new AIMessage(message?.content),
      );

      const maxRetries = 3;
      let retryCount = 0;
      let lastError: any = null;
      let result: any;

      while (retryCount <= maxRetries) {
        console.log(`AI reasoning attempt ${retryCount + 1}/${maxRetries}`);

        try {
          const input =
            typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input;

          // Only use history on first try, not during retries
          const chat_history = retryCount === 0 ? history : [];

          // STEP 4: Execute the command
          result = await this.executor.invoke({ input, chat_history });

          if (result && result.output) {
            // Check if the result contains error indicators
            if (
              typeof result.output === 'string' &&
              (result.output.includes('error') ||
                result.output.includes('Error') ||
                result.output.includes('failed'))
            ) {
              retryCount++;

              if (retryCount === maxRetries) {
                const structuredError = {
                  step: 'reasoning',
                  message: 'AI reasoning max retries reached, returning error output',
                  details: {
                    error: result.output,
                    retryCount: retryCount,
                    command: input,
                  },
                };
                console.error('Agent error:', JSON.stringify(structuredError));

                // STEP 5: Persist messages even for error results
                try {
                  const threadId =
                    typeof commandOrParams === 'string' ? undefined : commandOrParams?.threadId;
                  await this.db?.createMessage(
                    { content: input, user_id: this.context?.user?.id, message_type: 'human' },
                    threadId,
                  );
                  await this.db?.createMessage(
                    { content: result.output, user_id: this.context?.user?.id, message_type: 'ai' },
                    threadId,
                  );
                } catch (dbError) {
                  const persistError = {
                    step: 'database',
                    message: 'Error persisting message.',
                    details: {
                      error: dbError instanceof Error ? dbError.message : String(dbError),
                    },
                  };
                  console.error('Database error:', JSON.stringify(persistError));
                }

                return result.output;
              }

              const retryPrompt = `The previous command failed with error: "${result.output}". Please rethink and try to change the approach and fix the issue and try again with the command. 
              If could not resolve the problem. Base on the error information, show user the process lead to error. Try suggest user the next step to resolve the problem. Command below: `;

              if (typeof commandOrParams === 'string') {
                commandOrParams = retryPrompt + commandOrParams;
              } else {
                commandOrParams.input = retryPrompt + commandOrParams.input;
              }

              const retryError = {
                step: 'reasoning',
                message: 'AI reasoning attempt failed with output error, retrying',
                details: {
                  error: result.output,
                  retryCount: retryCount,
                  command: input,
                },
              };
              console.error('Agent retry:', JSON.stringify(retryError));
              continue;
            }

            // STEP 5: Persist successful messages
            try {
              const threadId =
                typeof commandOrParams === 'string' ? undefined : commandOrParams?.threadId;

              await this.db?.createMessage(
                { content: input, user_id: this.context?.user?.id, message_type: 'human' },
                threadId,
              );

              await this.db?.createMessage(
                { content: result.output, user_id: this.context?.user?.id, message_type: 'ai' },
                threadId,
              );

              console.log('Message persisted successfully');
            } catch (dbError) {
              const persistError = {
                step: 'database',
                message: 'Error persisting message.',
                details: {
                  error: dbError instanceof Error ? dbError.message : String(dbError),
                },
              };
              console.error('Database error:', JSON.stringify(persistError));
              // Continue even if persistence fails
            }

            return result.output;
          }
        } catch (error) {
          lastError = error;
          const executionError = {
            step: 'reasoning',
            message: `AI reasoning attempt ${retryCount + 1} failed with exception`,
            details: {
              error: error instanceof Error ? error.message : String(error),
              retryCount: retryCount,
              command:
                typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
            },
          };
          console.error('Agent error:', JSON.stringify(executionError));

          retryCount++;

          if (retryCount === maxRetries) {
            const maxRetryError = {
              step: 'reasoning',
              message: 'AI reasoning max retries reached, returning error',
              details: {
                error: lastError instanceof Error ? lastError.message : String(lastError),
                retryCount: retryCount,
                command:
                  typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
              },
            };
            console.error('Agent error:', JSON.stringify(maxRetryError));

            // Create a structured error for the reasoning failure
            const structuredError: StructuredError = {
              step: 'reasoning',
              message: lastError instanceof Error ? lastError.message : String(lastError),
              details: {
                error: lastError instanceof Error ? lastError.message : String(lastError),
                retryCount: retryCount,
                command:
                  typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
              },
            };

            // Generate enhanced suggestion
            const suggestion = this.generateEnhancedSuggestion(
              'reasoning',
              structuredError,
              commandOrParams,
            );

            return JSON.stringify({
              status: 'error',
              tool: 'agent',
              toolType: 'ai_reasoning',
              process: 'command_execution',
              errorStep: 'reasoning',
              processStage: 'AI Reasoning',
              message: lastError instanceof Error ? lastError.message : String(lastError),
              details: structuredError.details,
              suggestion: suggestion,
              parameters:
                typeof commandOrParams === 'string' ? { input: commandOrParams } : commandOrParams,
            });
          }

          // Retry prompt
          const errorMsg = lastError instanceof Error ? lastError.message : String(lastError);
          const retryPrompt = `The previous command failed with error: "${errorMsg}". Please rethink and try to change the params and fix the issue and try again with the command: `;

          if (typeof commandOrParams === 'string') {
            commandOrParams = retryPrompt + commandOrParams;
          } else {
            commandOrParams.input = retryPrompt + commandOrParams.input;
          }
        }
      }

      // Fallback if loop ended without return
      const structuredError: StructuredError = {
        step: 'execution',
        message: 'Execution failed after maximum retries',
        details: {
          retryCount: retryCount,
          lastError: lastError instanceof Error ? lastError.message : String(lastError),
          command: typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
        },
      };

      console.error('Agent error:', JSON.stringify(structuredError));

      const suggestion = this.generateEnhancedSuggestion(
        'execution',
        structuredError,
        commandOrParams,
      );

      return JSON.stringify({
        status: 'error',
        tool: 'agent',
        toolType: 'ai_reasoning',
        process: 'command_execution',
        errorStep: 'execution',
        processStage: 'Execution',
        message: 'Execution failed after maximum retries',
        details: structuredError.details,
        suggestion: suggestion,
        parameters:
          typeof commandOrParams === 'string' ? { input: commandOrParams } : commandOrParams,
      });
    } catch (error) {
      const agentError = {
        step:
          typeof error === 'object' && error !== null && 'step' in error
            ? (error as StructuredError).step
            : 'unknown',
        message:
          typeof error === 'object' && error !== null && 'message' in error
            ? (error as StructuredError).message
            : String(error),
        details:
          typeof error === 'object' && error !== null && 'details' in error
            ? (error as StructuredError).details
            : {},
      };
      console.error('Agent execution error:', agentError);

      // Determine error type and structure response accordingly
      let errorStep = 'unknown';
      let errorMessage = '';
      let errorDetails = {};

      if (typeof error === 'object' && error !== null) {
        // Handle structured errors we threw earlier
        if ('step' in error) {
          const structuredError = error as StructuredError;
          errorStep = structuredError.step;
          errorMessage = structuredError.message;
          errorDetails = structuredError.details || {};

          // Generate enhanced suggestion
          const suggestion = this.generateEnhancedSuggestion(
            errorStep,
            structuredError,
            commandOrParams,
          );

          return JSON.stringify({
            status: 'error',
            tool: 'agent',
            toolType: 'ai_reasoning',
            process: 'command_execution',
            errorStep: errorStep,
            processStage:
              errorStep.replace('_', ' ').charAt(0).toUpperCase() +
              errorStep.replace('_', ' ').slice(1),
            message: errorMessage,
            details: errorDetails,
            suggestion: suggestion,
            parameters:
              typeof commandOrParams === 'string' ? { input: commandOrParams } : commandOrParams,
          });
        } else if (error instanceof Error) {
          // Handle standard Error objects
          errorStep = 'execution';
          errorMessage = error.message;

          // Create mock structured error for suggestion generation
          const mockStructuredError: StructuredError = {
            step: errorStep,
            message: errorMessage,
            details: {
              error: errorMessage,
              command:
                typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
            },
          };

          const suggestion = this.generateEnhancedSuggestion(
            errorStep,
            mockStructuredError,
            commandOrParams,
          );

          return JSON.stringify({
            status: 'error',
            tool: 'agent',
            toolType: 'ai_reasoning',
            process: 'command_execution',
            errorStep: errorStep,
            processStage: 'Execution',
            message: errorMessage,
            details: mockStructuredError.details,
            suggestion: suggestion,
            parameters:
              typeof commandOrParams === 'string' ? { input: commandOrParams } : commandOrParams,
          });
        }
      }

      // Default error handling for other cases
      errorStep = 'execution';
      errorMessage = error instanceof Error ? error.message : String(error);

      const mockStructuredError: StructuredError = {
        step: errorStep,
        message: errorMessage,
        details: {
          error: errorMessage,
          command: typeof commandOrParams === 'string' ? commandOrParams : commandOrParams.input,
        },
      };

      const suggestion = this.generateEnhancedSuggestion(
        errorStep,
        mockStructuredError,
        commandOrParams,
      );

      return JSON.stringify({
        status: 'error',
        tool: 'agent',
        toolType: 'ai_reasoning',
        process: 'command_execution',
        errorStep: errorStep,
        processStage: 'Execution',
        message: errorMessage,
        details: mockStructuredError.details,
        suggestion: suggestion,
        parameters:
          typeof commandOrParams === 'string' ? { input: commandOrParams } : commandOrParams,
      });
    }
  }

  public getWallet(): IWallet {
    return this.wallet;
  }

  public getNetworks(): NetworksConfig['networks'] {
    return this.networks;
  }
}
