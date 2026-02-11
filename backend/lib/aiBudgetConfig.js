/**
 * AI BUDGET CONFIGURATION
 * 
 * Single source of truth for all token budget constants and behavior.
 * All values have sensible defaults and can be overridden via environment variables.
 * 
 * @see backend/README-ai-budget.md for full documentation
 */

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Clamp an integer value between min and max with fallback
 * @param {string} name - Config name for logging
 * @param {number|string} value - Value to clamp
 * @param {number} min - Minimum allowed value
 * @param {number} max - Maximum allowed value
 * @param {number} fallback - Default if value is invalid
 * @returns {number} Clamped integer value
 */
export function clampInt(name, value, min, max, fallback) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    return fallback;
  }
  if (parsed < min) {
    console.warn(`[AiBudgetConfig] ${name}=${parsed} below min ${min}, using ${min}`);
    return min;
  }
  if (parsed > max) {
    console.warn(`[AiBudgetConfig] ${name}=${parsed} above max ${max}, using ${max}`);
    return max;
  }
  return parsed;
}

// ============================================================================
// DEFAULT CONSTANTS (code defaults, overridable via env)
// ============================================================================

/**
 * Default budget constants
 * These are the baseline values used when no env overrides are set
 */
export const DEFAULT_BUDGET = {
  // Total token budget for entire request (input + reserved output)
  HARD_CEILING: 4000,
  
  // Maximum tokens for system prompt (includes tenant context, instructions)
  SYSTEM_PROMPT_CAP: 1200,
  
  // Maximum tokens for tool schemas (JSON definitions)
  TOOL_SCHEMA_CAP: 800,
  
  // Maximum tokens for memory/RAG context injection
  MEMORY_CAP: 250,
  
  // Maximum tokens for tool result summaries
  TOOL_RESULT_CAP: 700,
  
  // Reserved tokens for model output (max_tokens parameter)
  OUTPUT_MAX_TOKENS: 350,
};

/**
 * Default memory configuration
 */
export const DEFAULT_MEMORY = {
  // Number of memory chunks to retrieve
  TOP_K: 8,
  
  // Max characters per memory chunk (before token estimation)
  MAX_CHUNK_CHARS: 2000,
  
  // Minimum similarity score for memory retrieval
  MIN_SIMILARITY: 0.7,
  
  // Embedding provider and model
  EMBEDDING_PROVIDER: 'openai',
  EMBEDDING_MODEL: 'text-embedding-3-small',
};

/**
 * Bounds for environment variable validation
 */
export const BOUNDS = {
  HARD_CEILING: { min: 1000, max: 16000 },
  SYSTEM_PROMPT_CAP: { min: 200, max: 4000 },
  TOOL_SCHEMA_CAP: { min: 100, max: 2000 },
  MEMORY_CAP: { min: 50, max: 1000 },
  TOOL_RESULT_CAP: { min: 100, max: 2000 },
  OUTPUT_MAX_TOKENS: { min: 100, max: 2000 },
  TOP_K: { min: 1, max: 20 },
  MAX_CHUNK_CHARS: { min: 50, max: 2000 },
};

/**
 * Drop order when over budget
 * Components are trimmed/dropped in this order until under budget
 */
export const DROP_ORDER = ['memory', 'tools', 'messages', 'system'];

/**
 * Core tools that should never be removed during tool trimming
 */
export const CORE_TOOLS = [
  'fetch_tenant_snapshot',
  'search_leads',
  'search_contacts', 
  'search_accounts',
  'search_activities',
  'search_notes',
  'list_activities',
  'create_lead',
  // Critical write tools that must always remain available
  'update_lead',
  'create_activity',
  'create_note',
  'update_activity',
  'suggest_next_actions',
];

// ============================================================================
// CONFIGURATION GETTER
// ============================================================================

/**
 * Get resolved AI budget configuration with defaults + env overrides + bounds
 * @returns {object} Complete budget configuration
 */
export function getAiBudgetConfig() {
  return {
    // Token budget caps
    hardCeiling: clampInt(
      'AI_TOKEN_HARD_CEILING',
      process.env.AI_TOKEN_HARD_CEILING,
      BOUNDS.HARD_CEILING.min,
      BOUNDS.HARD_CEILING.max,
      DEFAULT_BUDGET.HARD_CEILING
    ),
    systemPromptCap: clampInt(
      'AI_SYSTEM_PROMPT_CAP',
      process.env.AI_SYSTEM_PROMPT_CAP,
      BOUNDS.SYSTEM_PROMPT_CAP.min,
      BOUNDS.SYSTEM_PROMPT_CAP.max,
      DEFAULT_BUDGET.SYSTEM_PROMPT_CAP
    ),
    toolSchemaCap: clampInt(
      'AI_TOOL_SCHEMA_CAP',
      process.env.AI_TOOL_SCHEMA_CAP,
      BOUNDS.TOOL_SCHEMA_CAP.min,
      BOUNDS.TOOL_SCHEMA_CAP.max,
      DEFAULT_BUDGET.TOOL_SCHEMA_CAP
    ),
    memoryCap: clampInt(
      'AI_MEMORY_CAP',
      process.env.AI_MEMORY_CAP,
      BOUNDS.MEMORY_CAP.min,
      BOUNDS.MEMORY_CAP.max,
      DEFAULT_BUDGET.MEMORY_CAP
    ),
    toolResultCap: clampInt(
      'AI_TOOL_RESULT_CAP',
      process.env.AI_TOOL_RESULT_CAP,
      BOUNDS.TOOL_RESULT_CAP.min,
      BOUNDS.TOOL_RESULT_CAP.max,
      DEFAULT_BUDGET.TOOL_RESULT_CAP
    ),
    outputMaxTokens: clampInt(
      'AI_OUTPUT_MAX_TOKENS',
      process.env.AI_OUTPUT_MAX_TOKENS,
      BOUNDS.OUTPUT_MAX_TOKENS.min,
      BOUNDS.OUTPUT_MAX_TOKENS.max,
      DEFAULT_BUDGET.OUTPUT_MAX_TOKENS
    ),
    
    // Policy
    dropOrder: DROP_ORDER,
    coreTools: CORE_TOOLS,
    
    // Derived caps object for tokenBudget.js compatibility
    caps: {
      HARD_CEILING: clampInt('AI_TOKEN_HARD_CEILING', process.env.AI_TOKEN_HARD_CEILING, BOUNDS.HARD_CEILING.min, BOUNDS.HARD_CEILING.max, DEFAULT_BUDGET.HARD_CEILING),
      SYSTEM_PROMPT: clampInt('AI_SYSTEM_PROMPT_CAP', process.env.AI_SYSTEM_PROMPT_CAP, BOUNDS.SYSTEM_PROMPT_CAP.min, BOUNDS.SYSTEM_PROMPT_CAP.max, DEFAULT_BUDGET.SYSTEM_PROMPT_CAP),
      TOOL_SCHEMA: clampInt('AI_TOOL_SCHEMA_CAP', process.env.AI_TOOL_SCHEMA_CAP, BOUNDS.TOOL_SCHEMA_CAP.min, BOUNDS.TOOL_SCHEMA_CAP.max, DEFAULT_BUDGET.TOOL_SCHEMA_CAP),
      MEMORY: clampInt('AI_MEMORY_CAP', process.env.AI_MEMORY_CAP, BOUNDS.MEMORY_CAP.min, BOUNDS.MEMORY_CAP.max, DEFAULT_BUDGET.MEMORY_CAP),
      TOOL_RESULT: clampInt('AI_TOOL_RESULT_CAP', process.env.AI_TOOL_RESULT_CAP, BOUNDS.TOOL_RESULT_CAP.min, BOUNDS.TOOL_RESULT_CAP.max, DEFAULT_BUDGET.TOOL_RESULT_CAP),
      OUTPUT_MAX: clampInt('AI_OUTPUT_MAX_TOKENS', process.env.AI_OUTPUT_MAX_TOKENS, BOUNDS.OUTPUT_MAX_TOKENS.min, BOUNDS.OUTPUT_MAX_TOKENS.max, DEFAULT_BUDGET.OUTPUT_MAX_TOKENS),
    },
  };
}

/**
 * Get resolved memory configuration with defaults + env overrides
 * @returns {object} Complete memory configuration
 */
export function getAiMemoryConfig() {
  return {
    enabled: process.env.MEMORY_ENABLED === 'true',
    alwaysOn: process.env.AI_MEMORY_ALWAYS_ON === 'true',
    alwaysOff: process.env.AI_MEMORY_ALWAYS_OFF === 'true',
    topK: clampInt(
      'MEMORY_TOP_K',
      process.env.MEMORY_TOP_K,
      BOUNDS.TOP_K.min,
      BOUNDS.TOP_K.max,
      DEFAULT_MEMORY.TOP_K
    ),
    maxChunkChars: clampInt(
      'MEMORY_MAX_CHUNK_CHARS',
      process.env.MEMORY_MAX_CHUNK_CHARS,
      BOUNDS.MAX_CHUNK_CHARS.min,
      BOUNDS.MAX_CHUNK_CHARS.max,
      DEFAULT_MEMORY.MAX_CHUNK_CHARS
    ),
    minSimilarity: parseFloat(process.env.MEMORY_MIN_SIMILARITY || String(DEFAULT_MEMORY.MIN_SIMILARITY)),
    embeddingProvider: process.env.MEMORY_EMBEDDING_PROVIDER || DEFAULT_MEMORY.EMBEDDING_PROVIDER,
    embeddingModel: process.env.MEMORY_EMBEDDING_MODEL || DEFAULT_MEMORY.EMBEDDING_MODEL,
  };
}

/**
 * Log current configuration (for debugging)
 */
export function logAiBudgetConfig() {
  const budget = getAiBudgetConfig();
  const memory = getAiMemoryConfig();
  
  console.log('[AiBudgetConfig] Token Budget:', {
    hardCeiling: budget.hardCeiling,
    systemPromptCap: budget.systemPromptCap,
    toolSchemaCap: budget.toolSchemaCap,
    memoryCap: budget.memoryCap,
    toolResultCap: budget.toolResultCap,
    outputMaxTokens: budget.outputMaxTokens,
  });
  
  console.log('[AiBudgetConfig] Memory Config:', {
    enabled: memory.enabled,
    alwaysOn: memory.alwaysOn,
    alwaysOff: memory.alwaysOff,
    topK: memory.topK,
    maxChunkChars: memory.maxChunkChars,
  });
}
