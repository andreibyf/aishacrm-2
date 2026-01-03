import OpenAI from 'openai';
import logger from './logger.js';

/**
 * aiProvider.js
 * Thin wrapper around OpenAI Chat Completions. Provides:
 *  - Safe initialization (graceful error if key missing)
 *  - Simple chat completion with optional conversation trimming
 *  - Structured error responses (status + message)
 */

const defaultApiKey = process.env.OPENAI_API_KEY || null;
if (!defaultApiKey) {
  logger.warn('[aiProvider] No DEFAULT OPENAI_API_KEY set; will require tenant-level key.');
}

function getClient(apiKey) {
  const key = apiKey || defaultApiKey;
  if (!key) return null;
  try {
    return new OpenAI({ apiKey: key });
  } catch (err) {
    logger.error({ err }, '[aiProvider] Failed to init OpenAI client');
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
    logger.error({ err }, '[aiProvider] OpenAI chat error');
    return { status: 'error', error: err.message || String(err) };
  }
}

import { getAgentCharter } from './agentCharters.js';

/**
 * Build a system prompt tailored to a tenant and optional agent persona.
 *
 * The base CRM assistant instructions remain intact, but if an
 * `agentName` is provided and a charter is defined for that agent, the
 * charter text will be prepended to the prompt.  This allows the Sales
 * Manager and Customer Service Manager agents to operate with their own
 * mission statements and responsibilities while still inheriting the
 * general CRM assistant behaviour.
 *
 * @param {Object} opts
 * @param {string} opts.tenantName - The tenant name used for context
 * @param {string} [opts.agentName] - Optional agent persona name
 * @returns {string} System prompt
 */
export function buildSystemPrompt({ tenantName, agentName = null }) {
  const basePrompt = `You are Aisha CRM Assistant. You help users query and summarize CRM data. Tenant: ${tenantName || 'Unknown Tenant'}. Keep answers concise, actionable, and include follow-up suggestions when helpful.

**PROACTIVE NEXT ACTIONS (CRITICAL):**
When users ask open-ended questions like "what should I do next?", "what do you think?", "how should I proceed?", or "what's my next step?":
- NEVER respond with "I'm not sure" or ask them to clarify
- ALWAYS analyze the current entity state (notes, activities, stage, last contact date)
- Suggest 2-3 specific, actionable next steps with reasoning
- Use available context to make intelligent recommendations
- Prioritize follow-ups based on urgency and lead temperature`;

  // Append agent-specific charter if provided
  const charterText = getAgentCharter(agentName);
  if (charterText) {
    return `${charterText}\n\n${basePrompt}`;
  }
  return basePrompt;
}

/**
 * Expose a safe OpenAI client accessor for advanced routes that need tool calling.
 */
export function getOpenAIClient(apiKey = null) {
  return getClient(apiKey);
}
