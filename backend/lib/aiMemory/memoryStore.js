/**
 * MEMORY STORE MODULE FOR AI MEMORY
 * Database operations for storing and retrieving memory chunks
 * Uses Supabase with pgvector for vector similarity search
 */

import crypto from 'crypto';
import { getSupabaseClient } from '../supabase-db.js';
import { redactSensitive, sanitizeForMemory } from './redaction.js';
import { chunkText } from './chunker.js';
import { embedText } from './embedder.js';

/**
 * Configuration from environment
 */
const MEMORY_CONFIG = {
  enabled: process.env.MEMORY_ENABLED === 'true',
  topK: parseInt(process.env.MEMORY_TOP_K || '8', 10),
  maxChunkChars: parseInt(process.env.MEMORY_MAX_CHUNK_CHARS || '3500', 10),
  minSimilarity: parseFloat(process.env.MEMORY_MIN_SIMILARITY || '0.7')
};

/**
 * Generate SHA-256 hash of content for deduplication
 * @param {string} content - Content to hash
 * @returns {string} - Hex-encoded hash
 */
function hashContent(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Upsert memory chunks for an entity or general tenant context
 * Chunks, embeds, and stores content with deduplication
 * 
 * @param {object} params - Upsert parameters
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.content - Raw content to store
 * @param {string} params.sourceType - Source type (note, activity, transcript, email, document)
 * @param {string} params.entityType - Optional entity type (lead, contact, account, opportunity)
 * @param {string} params.entityId - Optional entity UUID
 * @param {object} params.metadata - Optional metadata object
 * @returns {Promise<object>} - { success: boolean, chunksCreated: number, chunksSkipped: number }
 */
export async function upsertMemoryChunks(params) {
  const { tenantId, content, sourceType, entityType, entityId, metadata = {} } = params;
  
  if (!MEMORY_CONFIG.enabled) {
    return { success: true, chunksCreated: 0, chunksSkipped: 0, reason: 'memory disabled' };
  }
  
  if (!tenantId || !content || !sourceType) {
    throw new Error('tenantId, content, and sourceType are required');
  }
  
  // Sanitize and redact content
  const sanitized = sanitizeForMemory(content);
  
  if (!sanitized || sanitized.length < 100) {
    return { success: true, chunksCreated: 0, chunksSkipped: 0, reason: 'content too short' };
  }
  
  // Chunk text
  const chunks = chunkText(sanitized, { maxChars: MEMORY_CONFIG.maxChunkChars });
  
  if (chunks.length === 0) {
    return { success: true, chunksCreated: 0, chunksSkipped: 0, reason: 'no chunks generated' };
  }
  
  let chunksCreated = 0;
  let chunksSkipped = 0;
  
  const supabase = getSupabaseClient();
  
  for (const chunk of chunks) {
    try {
      // Generate content hash for deduplication
      const contentHash = hashContent(chunk);
      
      // Check if chunk already exists for this tenant
      const { data: existing } = await supabase
        .from('ai_memory_chunks')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('content_hash', contentHash)
        .maybeSingle();
      
      if (existing) {
        chunksSkipped++;
        continue; // Skip duplicate
      }
      
      // Generate embedding
      const embedding = await embedText(chunk, { tenantId });
      
      // Insert memory chunk
      const { error } = await supabase
        .from('ai_memory_chunks')
        .insert({
          tenant_id: tenantId,
          entity_type: entityType || null,
          entity_id: entityId || null,
          source_type: sourceType,
          content: chunk,
          content_hash: contentHash,
          embedding: JSON.stringify(embedding), // pgvector accepts JSON array
          metadata: metadata
        });
      
      if (error) {
        console.error(`[upsertMemoryChunks] Insert error:`, error);
        continue; // Skip failed chunk
      }
      
      chunksCreated++;
    } catch (err) {
      console.error(`[upsertMemoryChunks] Failed to process chunk:`, err.message);
      chunksSkipped++;
    }
  }
  
  return { success: true, chunksCreated, chunksSkipped };
}

/**
 * Query memory for relevant context using vector similarity search
 * 
 * @param {object} params - Query parameters
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.query - Search query text
 * @param {number} params.topK - Number of results to return (default: env MEMORY_TOP_K)
 * @param {string} params.entityType - Optional filter by entity type
 * @param {string} params.entityId - Optional filter by entity ID
 * @param {string} params.sourceType - Optional filter by source type
 * @returns {Promise<object[]>} - Array of memory chunks with similarity scores
 */
export async function queryMemory(params) {
  const {
    tenantId,
    query,
    topK = MEMORY_CONFIG.topK,
    entityType,
    entityId,
    sourceType
  } = params;
  
  if (!MEMORY_CONFIG.enabled) {
    return [];
  }
  
  if (!tenantId || !query) {
    throw new Error('tenantId and query are required');
  }
  
  try {
    // Generate embedding for query
    const queryEmbedding = await embedText(query, { tenantId });
    
    const supabase = getSupabaseClient();
    
    // Build query with filters
    let queryBuilder = supabase
      .from('ai_memory_chunks')
      .select('id, content, source_type, entity_type, entity_id, created_at, metadata')
      .eq('tenant_id', tenantId);
    
    // Apply optional filters
    if (entityType) queryBuilder = queryBuilder.eq('entity_type', entityType);
    if (entityId) queryBuilder = queryBuilder.eq('entity_id', entityId);
    if (sourceType) queryBuilder = queryBuilder.eq('source_type', sourceType);
    
    // Vector similarity search using RPC (requires custom SQL function)
    // For now, fetch all matching chunks and compute similarity in-memory
    // TODO: Add RPC function for efficient vector search
    const { data: chunks, error } = await queryBuilder.limit(100); // Pre-filter limit
    
    if (error) {
      console.error(`[queryMemory] Query error:`, error);
      return [];
    }
    
    if (!chunks || chunks.length === 0) {
      return [];
    }
    
    // Compute cosine similarity for each chunk
    const results = chunks
      .map(chunk => {
        // Parse embedding from JSON
        const chunkEmbedding = JSON.parse(chunk.embedding || '[]');
        const similarity = cosineSimilarity(queryEmbedding, chunkEmbedding);
        
        return {
          ...chunk,
          similarity
        };
      })
      .filter(chunk => chunk.similarity >= MEMORY_CONFIG.minSimilarity)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, topK);
    
    return results;
  } catch (err) {
    console.error(`[queryMemory] Failed to query memory:`, err.message);
    return [];
  }
}

/**
 * Compute cosine similarity between two vectors
 * @param {number[]} a - First vector
 * @param {number[]} b - Second vector
 * @returns {number} - Similarity score (0-1)
 */
function cosineSimilarity(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
    return 0;
  }
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;
  
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  
  const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
  
  return magnitude === 0 ? 0 : dotProduct / magnitude;
}

/**
 * Delete memory chunks by entity
 * Useful when entity is deleted or needs memory refresh
 * 
 * @param {object} params - Delete parameters
 * @param {string} params.tenantId - Tenant UUID
 * @param {string} params.entityType - Entity type
 * @param {string} params.entityId - Entity UUID
 * @returns {Promise<object>} - { success: boolean, deletedCount: number }
 */
export async function deleteMemoryByEntity(params) {
  const { tenantId, entityType, entityId } = params;
  
  if (!tenantId || !entityType || !entityId) {
    throw new Error('tenantId, entityType, and entityId are required');
  }
  
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ai_memory_chunks')
    .delete()
    .eq('tenant_id', tenantId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .select('id');
  
  if (error) {
    console.error(`[deleteMemoryByEntity] Delete error:`, error);
    return { success: false, deletedCount: 0, error: error.message };
  }
  
  return { success: true, deletedCount: data?.length || 0 };
}

/**
 * Delete all memory for a tenant (use with caution!)
 * 
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<object>} - { success: boolean, deletedCount: number }
 */
export async function deleteAllMemory(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }
  
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ai_memory_chunks')
    .delete()
    .eq('tenant_id', tenantId)
    .select('id');
  
  if (error) {
    console.error(`[deleteAllMemory] Delete error:`, error);
    return { success: false, deletedCount: 0, error: error.message };
  }
  
  return { success: true, deletedCount: data?.length || 0 };
}

/**
 * Get memory statistics for a tenant
 * 
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<object>} - Statistics object
 */
export async function getMemoryStats(tenantId) {
  if (!tenantId) {
    throw new Error('tenantId is required');
  }
  
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('ai_memory_chunks')
    .select('source_type, entity_type, created_at')
    .eq('tenant_id', tenantId);
  
  if (error) {
    console.error(`[getMemoryStats] Query error:`, error);
    return { totalChunks: 0 };
  }
  
  const bySourceType = {};
  const byEntityType = {};
  
  data.forEach(chunk => {
    bySourceType[chunk.source_type] = (bySourceType[chunk.source_type] || 0) + 1;
    if (chunk.entity_type) {
      byEntityType[chunk.entity_type] = (byEntityType[chunk.entity_type] || 0) + 1;
    }
  });
  
  return {
    totalChunks: data.length,
    bySourceType,
    byEntityType,
    oldestChunk: data.length > 0 ? data[data.length - 1].created_at : null,
    newestChunk: data.length > 0 ? data[0].created_at : null
  };
}
