/**
 * EMBEDDER MODULE FOR AI MEMORY
 * Generates vector embeddings for text chunks using external AI providers
 * Integrates with aiEngine for tenant-aware API key resolution
 */

import fetch from 'node-fetch';
import { resolveLLMApiKey } from '../aiEngine/keyResolver.js';

/**
 * Default embedding configuration
 */
const DEFAULT_EMBEDDING_CONFIG = {
  provider: process.env.MEMORY_EMBEDDING_PROVIDER || 'openai',
  model: process.env.MEMORY_EMBEDDING_MODEL || 'text-embedding-3-small',
  dimensions: 1536 // OpenAI text-embedding-3-small default dimension
};

/**
 * Generate embedding for text using OpenAI-compatible API
 * @param {string} provider - Provider name (openai, anthropic, etc.)
 * @param {string} model - Model name
 * @param {string} text - Text to embed
 * @param {string} apiKey - API key for provider
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateOpenAIEmbedding(provider, model, text, apiKey) {
  const baseUrls = {
    openai: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    groq: process.env.GROQ_BASE_URL || 'https://api.groq.com/openai/v1',
    local: process.env.LOCAL_LLM_BASE_URL || 'http://localhost:1234/v1'
  };
  
  const baseUrl = (baseUrls[provider] || baseUrls.openai).replace(/\/$/, '');
  const url = `${baseUrl}/embeddings`;
  
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ model, input: text })
  });
  
  if (!resp.ok) {
    const errorText = await resp.text();
    throw new Error(`Embedding API error (${resp.status}): ${errorText}`);
  }
  
  const json = await resp.json();
  const embedding = json?.data?.[0]?.embedding;
  
  if (!embedding || !Array.isArray(embedding)) {
    throw new Error('Invalid embedding response format');
  }
  
  return embedding;
}

/**
 * Generate embedding for text chunk
 * Uses aiEngine for tenant-aware API key resolution
 * 
 * @param {string} text - Text to embed (should be pre-chunked and redacted)
 * @param {object} options - Embedding options
 * @param {string} options.tenantId - Tenant UUID for API key resolution
 * @param {string} options.provider - Override provider (default: env MEMORY_EMBEDDING_PROVIDER)
 * @param {string} options.model - Override model (default: env MEMORY_EMBEDDING_MODEL)
 * @returns {Promise<number[]>} - Embedding vector (1536 dimensions for text-embedding-3-small)
 * @throws {Error} - If embedding generation fails
 */
export async function embedText(text, options = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('embedText: text must be a non-empty string');
  }
  
  const config = { ...DEFAULT_EMBEDDING_CONFIG, ...options };
  const { provider, model, tenantId } = config;
  
  // Resolve API key using aiEngine (tenant -> user -> system -> env)
  let apiKey;
  try {
    apiKey = await resolveLLMApiKey({
      tenantSlugOrId: tenantId,
      provider: provider
    });
  } catch (err) {
    // Fallback to env var if key resolution fails
    if (provider === 'openai' && process.env.OPENAI_API_KEY) {
      apiKey = process.env.OPENAI_API_KEY;
    } else {
      throw new Error(`Failed to resolve API key for provider ${provider}: ${err.message}`);
    }
  }
  
  if (!apiKey) {
    throw new Error(`No API key available for embedding provider ${provider}`);
  }
  
  // Generate embedding
  try {
    const embedding = await generateOpenAIEmbedding(provider, model, text, apiKey);
    return embedding;
  } catch (err) {
    throw new Error(`Embedding generation failed: ${err.message}`);
  }
}

/**
 * Batch embed multiple text chunks
 * Reduces API calls by batching when provider supports it
 * 
 * @param {string[]} texts - Array of texts to embed
 * @param {object} options - Embedding options (same as embedText)
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function embedTextBatch(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    return [];
  }
  
  // For now, embed sequentially (OpenAI supports batch but adds complexity)
  // Future optimization: use batch API when available
  const embeddings = [];
  for (const text of texts) {
    try {
      const embedding = await embedText(text, options);
      embeddings.push(embedding);
    } catch (err) {
      console.error(`[embedTextBatch] Failed to embed text chunk: ${err.message}`);
      // Push null for failed chunks (caller can filter)
      embeddings.push(null);
    }
  }
  
  return embeddings;
}

/**
 * Estimate embedding cost (rough approximation)
 * OpenAI text-embedding-3-small: ~$0.00002 per 1K tokens (~$0.02 per 1M tokens)
 * 
 * @param {number} charCount - Number of characters to embed
 * @returns {number} - Estimated cost in USD
 */
export function estimateEmbeddingCost(charCount) {
  // Rough estimate: 1 token ≈ 4 characters
  const tokens = Math.ceil(charCount / 4);
  const costPer1KTokens = 0.00002; // OpenAI text-embedding-3-small
  return (tokens / 1000) * costPer1KTokens;
}
