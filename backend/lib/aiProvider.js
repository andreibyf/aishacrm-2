import OpenAI from 'openai';

/**
 * aiProvider.js
 * Thin wrapper around OpenAI Chat Completions. Provides:
 *  - Safe initialization (graceful error if key missing)
 *  - Simple chat completion with optional conversation trimming
 *  - Structured error responses (status + message)
 */

const apiKey = process.env.OPENAI_API_KEY || null;
let client = null;
if (apiKey) {
  try {
    client = new OpenAI({ apiKey });
  } catch (err) {
    console.error('[aiProvider] Failed to init OpenAI client:', err);
  }
} else {
  console.warn('[aiProvider] OPENAI_API_KEY not set; /api/ai/chat will return informative error.');
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
export async function createChatCompletion({ messages, model = 'gpt-4o-mini', temperature = 0.7, maxContextMessages = 40 }) {
  if (!client) {
    return { status: 'error', error: 'OPENAI_API_KEY not configured on backend' };
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
