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
 */

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
  return process.env.MEMORY_ENABLED === 'true';
}

/**
 * Get memory configuration with environment variable defaults
 * @returns {object} - Configuration object with all RAG settings
 */
export function getMemoryConfig() {
  return {
    enabled: process.env.MEMORY_ENABLED === 'true',
    topK: parseInt(process.env.MEMORY_TOP_K || '8', 10),
    maxChunkChars: parseInt(process.env.MEMORY_MAX_CHUNK_CHARS || '3500', 10),
    minSimilarity: parseFloat(process.env.MEMORY_MIN_SIMILARITY || '0.7'),
    embeddingProvider: process.env.MEMORY_EMBEDDING_PROVIDER || 'openai',
    embeddingModel: process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small'
  };
}
