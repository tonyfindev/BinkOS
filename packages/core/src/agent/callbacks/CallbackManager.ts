import { CallbackManagerForToolRun } from '@langchain/core/callbacks/manager';
import { RunnableConfig } from '@langchain/core/runnables';
import { DynamicStructuredTool } from '@langchain/core/tools';
import { v4 as uuidv4 } from 'uuid';
import { IToolExecutionCallback, ToolExecutionData, ToolExecutionState } from './types';
import { CustomDynamicStructuredTool, ToolProgress } from '../tools/types';

/**
 * Manages callbacks for agent operations
 */
export class CallbackManager {
  private toolExecutionCallbacks: IToolExecutionCallback[] = [];

  /**
   * Register a tool execution callback
   * @param callback The callback to register
   */
  registerToolExecutionCallback(callback: IToolExecutionCallback): void {
    this.toolExecutionCallbacks.push(callback);
  }

  /**
   * Unregister a tool execution callback
   * @param callback The callback to unregister
   */
  unregisterToolExecutionCallback(callback: IToolExecutionCallback): void {
    this.toolExecutionCallbacks = this.toolExecutionCallbacks.filter(cb => cb !== callback);
  }

  /**
   * Notify all registered callbacks about a tool execution event
   * @param data Information about the tool execution
   */
  async notifyToolExecution(data: ToolExecutionData): Promise<void> {
    await Promise.all(
      this.toolExecutionCallbacks.map(async callback => {
        try {
          await callback.onToolExecution(data);
        } catch (error) {
          console.error('Error in tool execution callback:', error);
        }
      }),
    );
  }

  /**
   * Wrap a DynamicStructuredTool with callback notifications
   * @param tool The tool to wrap
   * @returns A wrapped tool that notifies callbacks
   */
  wrapTool(tool: CustomDynamicStructuredTool): DynamicStructuredTool {
    const manager = this;
    const toolName = tool.name;
    const originalFunc = tool.func;

    // Create a wrapped function that notifies callbacks
    const wrappedFunc = async function (
      input: any,
      runManager?: CallbackManagerForToolRun,
      config?: RunnableConfig,
    ): Promise<any> {
      const startTime = Date.now();
      const executionId = uuidv4();

      // Notify tool execution started
      await manager.notifyToolExecution({
        id: executionId,
        toolName,
        input,
        message: `Tool ${toolName} execution started`,
        state: ToolExecutionState.STARTED,
        timestamp: startTime,
      });

      try {
        // Execute the original function
        const output = await originalFunc(input, runManager, config, (data: ToolProgress) => {
          manager.notifyToolExecution({
            id: executionId,
            toolName,
            input,
            data,
            message: data.message || `Tool ${toolName} in progress: ${data.progress || 0}%`,
            state: ToolExecutionState.IN_PROCESS,
            timestamp: Date.now(),
          });
        });
        const endTime = Date.now();

        let data = output;
        try {
          data = JSON.parse(output);
        } catch (error) {
          console.error('Error in tool execution callback:', error);
        }

        // Notify tool execution completed
        await manager.notifyToolExecution({
          id: executionId,
          toolName,
          input,
          data,
          message: `Tool ${toolName} execution completed successfully`,
          state: ToolExecutionState.COMPLETED,
          timestamp: endTime,
          executionTime: endTime - startTime,
        });

        return output;
      } catch (error) {
        const endTime = Date.now();
        const errorMessage = error instanceof Error ? error.message : String(error);

        // Notify tool execution failed
        await manager.notifyToolExecution({
          id: executionId,
          toolName,
          input,
          message: `Tool ${toolName} execution failed`,
          error: error,
          state: ToolExecutionState.FAILED,
          timestamp: endTime,
          executionTime: endTime - startTime,
        });

        throw error;
      }
    };

    // Create a new tool with the wrapped function
    return new DynamicStructuredTool({
      name: tool.name,
      description: tool.description,
      schema: tool.schema,
      func: wrappedFunc,
      returnDirect: tool.returnDirect,
    });
  }
}
