/**
 * AI MEMORY MODULE
 * RAG (Retrieval Augmented Generation) system for Ai-SHA
 * 
 * Provides tenant-scoped memory storage and retrieval using pgvector
 * Stores embeddings of notes, activities, and other content for context-aware conversations
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

/**
 * Check if memory system is enabled
 * @returns {boolean} - True if MEMORY_ENABLED=true in environment
 */
export function isMemoryEnabled() {
  return process.env.MEMORY_ENABLED === 'true';
}

/**
 * Get memory configuration
 * @returns {object} - Configuration object
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
