import OpenAI from 'openai';

/**
 * aiProvider.js
 * Thin wrapper around OpenAI Chat Completions. Provides:
 *  - Safe initialization (graceful error if key missing)
 *  - Simple chat completion with optional conversation trimming
 *  - Structured error responses (status + message)
 */

const defaultApiKey = process.env.OPENAI_API_KEY || null;
if (!defaultApiKey) {
  console.warn('[aiProvider] No DEFAULT OPENAI_API_KEY set; will require tenant-level key.');
}

function getClient(apiKey) {
  const key = apiKey || defaultApiKey;
  if (!key) return null;
  try {
    return new OpenAI({ apiKey: key });
  } catch (err) {
    console.error('[aiProvider] Failed to init OpenAI client:', err);
    return null;
  }
}

/**
 * Create a chat completion.
 * @param {Object} opts
 * @param {Array<{role:string,content:string}>} opts.messages - Full message array (will be trimmed if over maxTokensContext)
 * @param {string} [opts.model='gpt-4o-mini'] - Model to use (fallback safe default)
 * @param {number} [opts.temperature=0.7]
 * @param {number} [opts.maxContextMessages=40] - Max number of recent messages to send (older ones trimmed)
 * @returns {Promise<{status:string,content?:string,usage?:object,error?:string}>}
 */
export async function createChatCompletion({ messages, model = 'gpt-4o-mini', temperature = 0.7, maxContextMessages = 40, apiKey = null }) {
  const client = getClient(apiKey);
  if (!client) {
    return { status: 'error', error: 'OPENAI_API_KEY not configured (provide tenant integration or backend env)' };
  }
  try {
    const trimmed = Array.isArray(messages) ? messages.slice(-maxContextMessages) : [];

    const completion = await client.chat.completions.create({
      model,
      messages: trimmed,
      temperature
    });

    const choice = completion.choices?.[0];
    const content = choice?.message?.content || '';

    return {
      status: 'success',
      content,
      usage: completion.usage || null,
      model
    };
  } catch (err) {
    console.error('[aiProvider] OpenAI chat error:', err);
    return { status: 'error', error: err.message || String(err) };
  }
}

/**
 * Helper to build a system prompt given tenant context.
 */
export function buildSystemPrompt({ tenantName }) {
  return `You are Aisha CRM Assistant. You help users query and summarize CRM data. Tenant: ${tenantName || 'Unknown Tenant'}. Keep answers concise, actionable, and include follow-up suggestions when helpful.`;
}

/**
 * Expose a safe OpenAI client accessor for advanced routes that need tool calling.
 */
export function getOpenAIClient(apiKey = null) {
  return getClient(apiKey);
}
