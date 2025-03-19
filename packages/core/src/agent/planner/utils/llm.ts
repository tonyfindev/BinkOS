import { BaseLanguageModel, LanguageModelLike } from '@langchain/core/language_models/base';
import { Runnable, RunnableToolLike } from '@langchain/core/runnables';
import { DynamicTool } from '@langchain/core/tools';
import { DynamicStructuredTool } from '@langchain/core/tools';

export function shouldBindTools(
  llm: LanguageModelLike,
  tools: (RunnableToolLike | DynamicStructuredTool<any> | DynamicTool)[],
) {
  if (!Runnable.isRunnable(llm) || !('kwargs' in llm)) {
    return true;
  }
  if (!llm.kwargs || typeof llm.kwargs !== 'object' || !('tools' in llm.kwargs)) {
    return true;
  }
  let boundTools = llm.kwargs.tools as any;
  // google-style
  if (boundTools.length === 1 && 'functionDeclarations' in boundTools[0]) {
    boundTools = boundTools[0].functionDeclarations;
  }
  if (tools.length !== boundTools.length) {
    throw new Error(
      'Number of tools in the model.bindTools() and tools passed to createReactAgent must match',
    );
  }
  const toolNames = new Set(tools.map(tool => tool.name));
  const boundToolNames = new Set();
  for (const boundTool of boundTools) {
    let boundToolName;
    // OpenAI-style tool
    if ('type' in boundTool && boundTool.type === 'function') {
      boundToolName = boundTool.function.name;
    }
    // Anthropic- or Google-style tool
    else if ('name' in boundTool) {
      boundToolName = boundTool.name;
    }
    // Bedrock-style tool
    else if ('toolSpec' in boundTool && 'name' in boundTool.toolSpec) {
      boundToolName = boundTool.toolSpec.name;
    }
    // unknown tool type so we'll ignore it
    else {
      continue;
    }
    boundToolNames.add(boundToolName);
  }
  const missingTools = [...toolNames].filter(x => !boundToolNames.has(x));
  if (missingTools.length > 0) {
    throw new Error(
      `Missing tools '${missingTools}' in the model.bindTools().` +
        `Tools in the model.bindTools() must match the tools passed to createReactAgent.`,
    );
  }
  return false;
}
