/**
 * AI MEMORY MODULE (PHASE 7)
 * RAG (Retrieval Augmented Generation) system for Ai-SHA
 * 
 * Provides tenant-scoped memory storage and retrieval using pgvector
 * Stores embeddings of notes, activities, and other content for context-aware conversations
 * 
 * Key Components:
 * - redaction.js: Sanitizes content, removes API keys/tokens/passwords
 * - chunker.js: Splits long content into overlapping chunks for embedding
 * - embedder.js: Generates vector embeddings via OpenAI API
 * - memoryStore.js: CRUD operations for ai_memory_chunks table
 * - conversationSummary.js: Rolling summaries for conversation context
 * 
 * @see backend/README-ai-budget.md for token budget documentation
 * @see backend/lib/aiBudgetConfig.js for centralized configuration
 */

import { getAiMemoryConfig } from '../aiBudgetConfig.js';

export { redactSensitive, containsSensitiveData, sanitizeForMemory } from './redaction.js';
export { chunkText, estimateChunkCount, calculateChunkedSize } from './chunker.js';
export { embedText, embedTextBatch, estimateEmbeddingCost } from './embedder.js';
export {
  upsertMemoryChunks,
  queryMemory,
  deleteMemoryByEntity,
  deleteAllMemory,
  getMemoryStats
} from './memoryStore.js';
export {
  updateConversationSummary,
  getConversationSummary
} from './conversationSummary.js';

// Import for wrapper function
import { getConversationSummary as _getConversationSummary } from './conversationSummary.js';

// ============================================================================
// MEMORY GATING - Controls when memory should be queried
// ============================================================================

/**
 * Patterns that indicate user wants historical/memory context
 * Only query memory when user explicitly or implicitly asks for past context
 */
const MEMORY_TRIGGER_PATTERNS = [
  /\b(last\s+time|previous(ly)?|earlier|before)\b/i,
  /\b(remind\s+me|what\s+did\s+we|recap|summary)\b/i,
  /\b(what\s+was\s+the\s+last|history|timeline)\b/i,
  /\b(what\s+happened|follow\s*up|next\s+steps)\b/i,
  /\b(notes?\s+(for|about|on)|last\s+note)\b/i,
  /\b(discussed|talked\s+about|mentioned)\b/i,
  /\b(remember\s+when|do\s+you\s+remember)\b/i,
];

/**
 * Determine if memory retrieval should be used for this message
 * Memory is expensive - only use when user asks for historical context
 * 
 * @param {string} userMessage - The user's message
 * @returns {boolean} True if memory should be queried
 */
export function shouldUseMemory(userMessage) {
  // PRECEDENCE: ALWAYS_OFF > MEMORY_ENABLED > ALWAYS_ON > patterns
  // Use centralized config for env var checks
  const memConfig = getAiMemoryConfig();
  
  // 1. ALWAYS_OFF overrides everything
  if (memConfig.alwaysOff) {
    return false;
  }
  
  // 2. Master switch must be enabled
  if (!memConfig.enabled) {
    return false;
  }
  
  // 3. ALWAYS_ON bypasses pattern matching (but respects master switch)
  if (memConfig.alwaysOn) {
    return true;
  }
  
  // Check if message matches any memory trigger pattern
  if (!userMessage || typeof userMessage !== 'string') {
    return false;
  }
  
  for (const pattern of MEMORY_TRIGGER_PATTERNS) {
    if (pattern.test(userMessage)) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determine if conversation summary should be injected
 * Only inject for longer conversations when user asks for context
 * 
 * @param {string} userMessage - The user's message
 * @param {number} messageCount - Number of messages in conversation
 * @param {number} minMessages - Minimum messages before summary injection (default 8)
 * @returns {boolean} True if summary should be injected
 */
export function shouldInjectConversationSummary(userMessage, messageCount, minMessages = 8) {
  // Must have enough messages to warrant a summary
  if (messageCount < minMessages) {
    return false;
  }
  
  // Use same gating as memory retrieval
  return shouldUseMemory(userMessage);
}

/**
 * Retrieve the latest conversation summary for a given conversation/tenant.
 *
 * This helper wraps the conversationSummaryStore API to return a plain
 * summary string. If no summary exists, it returns null. Use this to
 * inject rolling summaries into system prompts (e.g. in AI chat routes).
 *
 * @param {object} params
 * @param {string} params.conversationId - Conversation UUID
 * @param {string} params.tenantId - Tenant UUID
 * @returns {Promise<string|null>}
 */
export async function getConversationSummaryFromMemory({ conversationId, tenantId }) {
  if (!conversationId || !tenantId) {
    return null;
  }
  try {
    const summary = await _getConversationSummary({ conversationId, tenantId });
    return summary || null;
  } catch (err) {
    console.error(
      '[getConversationSummaryFromMemory] Error fetching conversation summary:',
      err?.message || err
    );
    return null;
  }
}

/**
 * Check if memory system is enabled
 * @returns {boolean} - True if MEMORY_ENABLED=true in environment
 */
export function isMemoryEnabled() {
  return getAiMemoryConfig().enabled;
}

/**
 * Get memory configuration with environment variable defaults
 * Uses centralized config from aiBudgetConfig.js
 * @returns {object} - Configuration object with all RAG settings
 */
export function getMemoryConfig() {
  return getAiMemoryConfig();
}
