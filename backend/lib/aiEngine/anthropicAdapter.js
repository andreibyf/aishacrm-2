/**
 * Anthropic Tool Calling Adapter
 * 
 * Converts between OpenAI tool format and Anthropic tool format,
 * allowing the existing chat loop to work with Claude models.
 */

import Anthropic from '@anthropic-ai/sdk';

/**
 * Create an Anthropic client instance
 * @param {string} apiKey - Anthropic API key
 * @returns {Anthropic}
 */
export function createAnthropicClient(apiKey) {
  return new Anthropic({
    apiKey: apiKey || process.env.ANTHROPIC_API_KEY,
  });
}

/**
 * Convert OpenAI tool schema format to Anthropic tool format
 * 
 * OpenAI: { type: "function", function: { name, description, parameters } }
 * Anthropic: { name, description, input_schema }
 * 
 * @param {Array} openaiTools - Array of OpenAI tool definitions
 * @returns {Array} Anthropic-formatted tools
 */
export function convertToolsToAnthropic(openaiTools) {
  if (!openaiTools || !Array.isArray(openaiTools)) {
    return [];
  }

  return openaiTools.map(tool => {
    if (tool.type !== 'function' || !tool.function) {
      console.warn('[AnthropicAdapter] Skipping non-function tool:', tool.type);
      return null;
    }

    const fn = tool.function;
    return {
      name: fn.name,
      description: fn.description || '',
      input_schema: fn.parameters || { type: 'object', properties: {} },
    };
  }).filter(Boolean);
}

/**
 * Convert OpenAI messages format to Anthropic messages format
 * 
 * Key differences:
 * - Anthropic uses separate 'system' param, not a system role message
 * - Tool results go in user messages with tool_result content blocks
 * - Assistant tool calls use tool_use content blocks
 * 
 * @param {Array} openaiMessages - OpenAI format messages
 * @returns {{ system: string, messages: Array }}
 */
export function convertMessagesToAnthropic(openaiMessages) {
  if (!openaiMessages || !Array.isArray(openaiMessages)) {
    return { system: '', messages: [] };
  }

  let systemPrompt = '';
  const messages = [];

  for (const msg of openaiMessages) {
    // Extract system message
    if (msg.role === 'system') {
      systemPrompt += (systemPrompt ? '\n\n' : '') + msg.content;
      continue;
    }

    // User message
    if (msg.role === 'user') {
      messages.push({
        role: 'user',
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      });
      continue;
    }

    // Assistant message with tool calls
    if (msg.role === 'assistant' && msg.tool_calls) {
      const contentBlocks = [];
      
      // Add text content if present
      if (msg.content) {
        contentBlocks.push({
          type: 'text',
          text: msg.content,
        });
      }

      // Convert tool calls to tool_use blocks
      for (const toolCall of msg.tool_calls) {
        contentBlocks.push({
          type: 'tool_use',
          id: toolCall.id,
          name: toolCall.function.name,
          input: typeof toolCall.function.arguments === 'string'
            ? JSON.parse(toolCall.function.arguments)
            : toolCall.function.arguments,
        });
      }

      messages.push({
        role: 'assistant',
        content: contentBlocks,
      });
      continue;
    }

    // Regular assistant message
    if (msg.role === 'assistant') {
      messages.push({
        role: 'assistant',
        content: msg.content || '',
      });
      continue;
    }

    // Tool result message - needs to be part of a user message
    if (msg.role === 'tool') {
      // Find if last message is a user message we can append to
      const lastMsg = messages[messages.length - 1];
      const toolResultBlock = {
        type: 'tool_result',
        tool_use_id: msg.tool_call_id,
        content: typeof msg.content === 'string' ? msg.content : JSON.stringify(msg.content),
      };

      if (lastMsg && lastMsg.role === 'user' && Array.isArray(lastMsg.content)) {
        // Append to existing user message content array
        lastMsg.content.push(toolResultBlock);
      } else {
        // Create new user message with tool result
        messages.push({
          role: 'user',
          content: [toolResultBlock],
        });
      }
      continue;
    }
  }

  return { system: systemPrompt, messages };
}

/**
 * Convert Anthropic response to OpenAI-compatible format
 * 
 * @param {Object} anthropicResponse - Raw Anthropic API response
 * @returns {Object} OpenAI-compatible response structure
 */
export function convertResponseToOpenAI(anthropicResponse) {
  const content = anthropicResponse.content || [];
  
  // Extract text content
  const textBlocks = content.filter(block => block.type === 'text');
  const textContent = textBlocks.map(b => b.text).join('\n') || null;

  // Extract tool use blocks
  const toolUseBlocks = content.filter(block => block.type === 'tool_use');

  // Convert to OpenAI tool_calls format
  const toolCalls = toolUseBlocks.length > 0
    ? toolUseBlocks.map(block => ({
        id: block.id,
        type: 'function',
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      }))
    : null;

  // Determine finish reason
  let finishReason = 'stop';
  if (anthropicResponse.stop_reason === 'tool_use') {
    finishReason = 'tool_calls';
  } else if (anthropicResponse.stop_reason === 'max_tokens') {
    finishReason = 'length';
  } else if (anthropicResponse.stop_reason === 'end_turn') {
    finishReason = 'stop';
  }

  return {
    id: anthropicResponse.id || `chatcmpl-${Date.now()}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: anthropicResponse.model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: textContent,
          tool_calls: toolCalls,
        },
        finish_reason: finishReason,
      },
    ],
    usage: {
      prompt_tokens: anthropicResponse.usage?.input_tokens || 0,
      completion_tokens: anthropicResponse.usage?.output_tokens || 0,
      total_tokens: (anthropicResponse.usage?.input_tokens || 0) + (anthropicResponse.usage?.output_tokens || 0),
    },
  };
}

/**
 * Create a chat completion using Anthropic's API
 * Returns response in OpenAI-compatible format for drop-in replacement
 * 
 * @param {Object} params
 * @param {Anthropic} params.client - Anthropic client instance
 * @param {string} params.model - Model name (e.g., claude-3-5-sonnet-20241022)
 * @param {Array} params.messages - OpenAI-format messages
 * @param {Array} [params.tools] - OpenAI-format tools
 * @param {number} [params.temperature] - Temperature (0-1)
 * @param {string|Object} [params.tool_choice] - Tool choice preference
 * @returns {Promise<Object>} OpenAI-compatible response
 */
export async function createAnthropicChatCompletion({
  client,
  model,
  messages,
  tools,
  temperature = 0.7,
  tool_choice,
}) {
  // Convert to Anthropic format
  const { system, messages: anthropicMessages } = convertMessagesToAnthropic(messages);
  const anthropicTools = convertToolsToAnthropic(tools);

  // Build request params
  const requestParams = {
    model,
    max_tokens: 4096,
    messages: anthropicMessages,
  };

  // Add system prompt if present
  if (system) {
    requestParams.system = system;
  }

  // Add tools if present
  if (anthropicTools.length > 0) {
    requestParams.tools = anthropicTools;
  }

  // Add temperature (Anthropic uses 0-1 scale like OpenAI)
  if (typeof temperature === 'number') {
    requestParams.temperature = temperature;
  }

  // Handle tool_choice
  if (tool_choice && anthropicTools.length > 0) {
    if (tool_choice === 'none') {
      // Don't send tools at all
      delete requestParams.tools;
    } else if (tool_choice === 'auto') {
      requestParams.tool_choice = { type: 'auto' };
    } else if (tool_choice === 'required') {
      requestParams.tool_choice = { type: 'any' };
    } else if (typeof tool_choice === 'object' && tool_choice.function?.name) {
      // Force specific tool
      requestParams.tool_choice = {
        type: 'tool',
        name: tool_choice.function.name,
      };
    }
  }

  console.log('[AnthropicAdapter] Request:', {
    model,
    messageCount: anthropicMessages.length,
    toolCount: anthropicTools.length,
    hasSystem: !!system,
    systemLength: system?.length || 0,
    temperature,
  });

  // Make the API call
  const startTime = Date.now();
  const response = await client.messages.create(requestParams);
  const durationMs = Date.now() - startTime;

  console.log('[AnthropicAdapter] Response:', {
    model: response.model,
    stopReason: response.stop_reason,
    contentBlocks: response.content?.length || 0,
    inputTokens: response.usage?.input_tokens,
    outputTokens: response.usage?.output_tokens,
    durationMs,
  });

  // Convert to OpenAI format
  return convertResponseToOpenAI(response);
}

/**
 * Wrapper that mimics OpenAI client interface for drop-in replacement
 * 
 * Usage:
 *   const client = createAnthropicClientWrapper(apiKey);
 *   const response = await client.chat.completions.create({ model, messages, tools });
 * 
 * @param {string} apiKey 
 * @returns {Object} OpenAI-compatible client interface
 */
export function createAnthropicClientWrapper(apiKey) {
  const anthropicClient = createAnthropicClient(apiKey);

  return {
    chat: {
      completions: {
        create: async (params) => {
          return createAnthropicChatCompletion({
            client: anthropicClient,
            model: params.model,
            messages: params.messages,
            tools: params.tools,
            temperature: params.temperature,
            tool_choice: params.tool_choice,
          });
        },
      },
    },
  };
}
