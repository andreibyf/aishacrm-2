/**
 * LLM Activity Logger
 *
 * Captures all LLM calls for real-time monitoring in Settings.
 *
 * Dual-path design:
 *   1. In-memory rolling buffer (MAX_ENTRIES, newest first) — fast, real-time,
 *      no DB round-trip. Source of truth for the LLMActivityMonitor UI.
 *   2. Async Supabase insert into `llm_activity_logs` (migration 151) —
 *      persistent, 90-day retention via pg_cron. Fire-and-forget; failures are
 *      counted in `persistCounters` and never block the LLM response path.
 *
 * Cost estimation is model-aware (see MODEL_COST_RATES / resolveModelRates) —
 * pricing is keyed by provider AND model substring so e.g. gpt-4o-mini isn't
 * billed at gpt-4o rates, and Claude haiku/sonnet/opus are distinguished.
 *
 * Observability: getLLMActivityStats().persistence surfaces
 *   { attempts, successes, errors, lastError, lastErrorAt }
 * so ops can detect sustained DB-persist failures without log scraping.
 *
 * Testing: __setSupabaseClientForTest / __resetSupabaseClientForTest /
 *   __resetPersistCountersForTest / buildPersistPayload / resolveModelRates
 *   are exported for unit tests only — do not call from production code.
 */

import { getSupabaseClient as getSupabaseClientReal } from '../supabase-db.js';

// Test seam: tests inject a stub (or null) via __setSupabaseClientForTest.
// Default resolver calls through to the real client factory.
let supabaseResolver = () => getSupabaseClientReal();

/**
 * Test hook: replace the Supabase client resolver. Pass null to disable.
 * Do not use in production code.
 */
export function __setSupabaseClientForTest(resolver) {
  supabaseResolver = typeof resolver === 'function' ? resolver : () => resolver;
}

/**
 * Test hook: restore the production Supabase client resolver.
 */
export function __resetSupabaseClientForTest() {
  supabaseResolver = () => getSupabaseClientReal();
}

const MAX_ENTRIES = 500;
const activityLog = [];

/**
 * Model-aware cost table (USD per 1K tokens).
 * Keys are lowercased model substrings tested against `entry.model`.
 * First match wins; `defaults` per provider catches unknown models.
 *
 * Sources: public vendor pricing pages. Update when providers reprice.
 * Intentionally conservative — prefer under-reporting to over-reporting.
 */
export const MODEL_COST_RATES = {
  openai: {
    defaults: { input: 0.0025, output: 0.01 },
    models: [
      { match: 'gpt-4o-mini', input: 0.00015, output: 0.0006 },
      { match: 'gpt-4o', input: 0.0025, output: 0.01 },
      { match: 'gpt-4.1-mini', input: 0.0004, output: 0.0016 },
      { match: 'gpt-4.1', input: 0.002, output: 0.008 },
      { match: 'o4-mini', input: 0.0011, output: 0.0044 },
      { match: 'o3-mini', input: 0.0011, output: 0.0044 },
      { match: 'o3', input: 0.002, output: 0.008 },
      { match: 'gpt-3.5', input: 0.0005, output: 0.0015 },
    ],
  },
  anthropic: {
    defaults: { input: 0.003, output: 0.015 },
    models: [
      { match: 'haiku', input: 0.0008, output: 0.004 },
      { match: 'sonnet', input: 0.003, output: 0.015 },
      { match: 'opus', input: 0.015, output: 0.075 },
    ],
  },
  groq: {
    defaults: { input: 0.0001, output: 0.0001 },
    models: [
      { match: 'llama-3.3-70b', input: 0.00059, output: 0.00079 },
      { match: 'llama-3.1-70b', input: 0.00059, output: 0.00079 },
      { match: 'llama-3.1-8b', input: 0.00005, output: 0.00008 },
      { match: 'mixtral-8x7b', input: 0.00024, output: 0.00024 },
    ],
  },
  local: {
    defaults: { input: 0, output: 0 },
    models: [],
  },
};

/**
 * Resolve per-1K token rates for a given provider+model.
 * Falls back to provider defaults, then to openai defaults.
 */
export function resolveModelRates(provider, model) {
  const providerKey = String(provider || '').toLowerCase();
  const modelKey = String(model || '').toLowerCase();
  const bucket = MODEL_COST_RATES[providerKey] || MODEL_COST_RATES.openai;
  if (modelKey && bucket.models) {
    const hit = bucket.models.find((m) => modelKey.includes(m.match));
    if (hit) return { input: hit.input, output: hit.output };
  }
  return bucket.defaults || MODEL_COST_RATES.openai.defaults;
}

// Observability counters — exposed via getLLMActivityStats() so ops can detect
// sustained DB-persist failures without reading application logs.
const persistCounters = {
  attempts: 0,
  successes: 0,
  errors: 0,
  lastError: null,
  lastErrorAt: null,
};

/**
 * Test hook: reset persist counters (used by unit tests).
 */
export function __resetPersistCountersForTest() {
  persistCounters.attempts = 0;
  persistCounters.successes = 0;
  persistCounters.errors = 0;
  persistCounters.lastError = null;
  persistCounters.lastErrorAt = null;
}

/**
 * Build the row payload inserted into llm_activity_logs.
 * Exported so tests can assert shape without a real Supabase client.
 */
export function buildPersistPayload(entry) {
  return {
    external_id: entry.id,
    tenant_id: entry.tenantId && entry.tenantId !== 'unknown' ? entry.tenantId : null,
    capability: entry.capability,
    provider: entry.provider,
    model: entry.model,
    node_id: entry.nodeId,
    container_id: entry.containerId,
    status: entry.status,
    duration_ms: entry.durationMs,
    error: entry.error,
    usage: entry.usage,
    tools_called: Array.isArray(entry.toolsCalled) ? entry.toolsCalled : [],
    intent: entry.intent,
    task_id: entry.taskId,
    request_id: entry.requestId,
    attempt: entry.attempt,
    total_attempts: entry.totalAttempts,
    created_at: entry.timestamp,
  };
}

/**
 * Non-blocking DB persist for one log entry.
 * Errors are caught and swallowed — DB issues must never affect LLM throughput.
 * Failures are counted in `persistCounters` and surfaced via stats.
 */
async function persistToDatabase(entry) {
  persistCounters.attempts += 1;
  try {
    const supabase = supabaseResolver();
    if (!supabase) return; // supabase not configured, skip silently (not counted as error)

    const { error } = await supabase.from('llm_activity_logs').insert(buildPersistPayload(entry));

    if (error) {
      persistCounters.errors += 1;
      persistCounters.lastError = error.message;
      persistCounters.lastErrorAt = new Date().toISOString();
      console.debug('[LLMActivityLogger] DB persist skipped:', error.message);
      return;
    }
    persistCounters.successes += 1;
  } catch (err) {
    persistCounters.errors += 1;
    persistCounters.lastError = err.message;
    persistCounters.lastErrorAt = new Date().toISOString();
    console.debug('[LLMActivityLogger] DB persist error (non-fatal):', err.message);
  }
}

/**
 * Get the node/container ID from environment.
 * Useful for distinguishing between multiple MCP worker containers.
 */
export function getNodeId() {
  return process.env.MCP_NODE_ID || process.env.HOSTNAME || 'backend';
}

/**
 * Log an LLM activity entry.
 *
 * Side effects:
 *   - Prepends the entry to the in-memory rolling buffer (trimmed to MAX_ENTRIES).
 *   - Emits a structured JSON line to stdout tagged [AIEngine][LLM_CALL_*].
 *   - Fires an async insert into `llm_activity_logs` via persistToDatabase
 *     (never awaited). The caller MUST NOT rely on the DB row existing after
 *     this function returns.
 *
 * @param {Object} entry
 * @param {string} entry.tenantId - Tenant UUID. The literal string 'unknown' is
 *   normalized to NULL in the DB row (used for unscoped/system calls).
 * @param {string} entry.capability - The capability used (chat_tools, json_strict, etc.)
 * @param {string} entry.provider - The LLM provider (openai, anthropic, groq, local)
 * @param {string} entry.model - The model name. Used by resolveModelRates for
 *   accurate per-1K cost estimation (e.g. gpt-4o-mini vs gpt-4o).
 * @param {string} [entry.nodeId] - Optional node/route identifier (e.g., "mcp:llm.generate_json")
 * @param {string} [entry.status] - "success" | "error" | "failover"
 * @param {number} [entry.durationMs] - Request duration in milliseconds
 * @param {string} [entry.error] - Error message if failed
 * @param {Object} [entry.usage] - Token usage { prompt_tokens, completion_tokens, total_tokens }
 * @param {number} [entry.attempt] - Which attempt in failover chain (1, 2, etc.)
 * @param {number} [entry.totalAttempts] - Total attempts in failover chain
 * @param {Array<string>} [entry.toolsCalled] - Array of tool names called during
 *   this request. Non-arrays are normalized to [] before DB insert.
 * @param {string} [entry.intent] - Classified intent code from intentClassifier (e.g., LEAD_CREATE, AI_SUGGEST_NEXT_ACTIONS)
 * @param {string} [entry.taskId] - Unique task identifier assigned at REQUESTED stage
 * @param {string} [entry.requestId] - Request-scoped correlation id ("req_<ts>_<rand9>")
 */
export function logLLMActivity(entry) {
  const containerId = getNodeId();

  const logEntry = {
    id: `llm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: new Date().toISOString(),
    containerId,
    tenantId: entry.tenantId || 'unknown',
    capability: entry.capability || 'unknown',
    provider: entry.provider || 'unknown',
    model: entry.model || 'unknown',
    nodeId: entry.nodeId || null,
    status: entry.status || 'success',
    durationMs: entry.durationMs || null,
    error: entry.error || null,
    usage: entry.usage || null,
    attempt: entry.attempt ?? null,
    totalAttempts: entry.totalAttempts ?? null,
    toolsCalled: entry.toolsCalled || null,
    intent: entry.intent || null,
    taskId: entry.taskId || null,
    requestId: entry.requestId || null,
  };

  activityLog.unshift(logEntry); // Add to front (newest first)

  // Keep buffer size limited
  if (activityLog.length > MAX_ENTRIES) {
    activityLog.length = MAX_ENTRIES;
  }

  // Structured JSON log for log aggregation tools (Loki, CloudWatch, etc.)
  const logTag =
    logEntry.status === 'success'
      ? '[AIEngine][LLM_CALL_SUCCESS]'
      : logEntry.status === 'failover'
        ? '[AIEngine][LLM_CALL_FAILOVER]'
        : '[AIEngine][LLM_CALL_ERROR]';

  console.log(
    logTag,
    JSON.stringify({
      containerId: logEntry.containerId,
      nodeId: logEntry.nodeId,
      tenantId: logEntry.tenantId,
      capability: logEntry.capability,
      provider: logEntry.provider,
      model: logEntry.model,
      status: logEntry.status,
      durationMs: logEntry.durationMs,
      attempt: logEntry.attempt,
      totalAttempts: logEntry.totalAttempts,
      usage: logEntry.usage,
      toolsCalled: logEntry.toolsCalled,
      taskId: logEntry.taskId,
      requestId: logEntry.requestId,
      error: logEntry.error,
    }),
  );

  // Fire-and-forget DB persist — never awaited, never blocks
  persistToDatabase(logEntry);
}

/**
 * Get recent LLM activity entries.
 *
 * @param {Object} [options]
 * @param {number} [options.limit=100] - Max entries to return
 * @param {string} [options.tenantId] - Filter by tenant
 * @param {string} [options.provider] - Filter by provider
 * @param {string} [options.capability] - Filter by capability
 * @param {string} [options.status] - Filter by status
 * @param {string} [options.since] - ISO timestamp to filter entries after
 * @returns {Array} Activity entries (newest first)
 */
export function getLLMActivity(options = {}) {
  const { limit = 100, tenantId, provider, capability, status, since } = options;

  let results = activityLog;

  // Apply filters
  if (tenantId) {
    results = results.filter((e) => e.tenantId === tenantId);
  }
  if (provider) {
    results = results.filter((e) => e.provider === provider);
  }
  if (capability) {
    results = results.filter((e) => e.capability === capability);
  }
  if (status) {
    results = results.filter((e) => e.status === status);
  }
  if (since) {
    const sinceDate = new Date(since);
    results = results.filter((e) => new Date(e.timestamp) > sinceDate);
  }

  return results.slice(0, limit);
}

/**
 * Get activity summary stats.
 *
 * @returns {Object} Summary statistics
 */
export function getLLMActivityStats() {
  const now = Date.now();
  const oneMinuteAgo = now - 60 * 1000;
  const fiveMinutesAgo = now - 5 * 60 * 1000;

  const recentEntries = activityLog.filter((e) => new Date(e.timestamp).getTime() > fiveMinutesAgo);
  const lastMinute = activityLog.filter((e) => new Date(e.timestamp).getTime() > oneMinuteAgo);

  // Count by provider/capability/status — use 5-min window when available, else full buffer
  const windowEntries = recentEntries.length > 0 ? recentEntries : activityLog;
  const windowLabel = recentEntries.length > 0 ? 'last5min' : 'buffer';

  const byProvider = {};
  const byCapability = {};
  const byStatus = {};

  for (const entry of windowEntries) {
    byProvider[entry.provider] = (byProvider[entry.provider] || 0) + 1;
    byCapability[entry.capability] = (byCapability[entry.capability] || 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }

  // allTime breakdowns always from full buffer (for cards that always show buffer totals)
  const allTimeByProvider = {};
  const allTimeByStatus = {};
  const allTimeByCapability = {};
  for (const entry of activityLog) {
    allTimeByProvider[entry.provider] = (allTimeByProvider[entry.provider] || 0) + 1;
    allTimeByStatus[entry.status] = (allTimeByStatus[entry.status] || 0) + 1;
    allTimeByCapability[entry.capability] = (allTimeByCapability[entry.capability] || 0) + 1;
  }

  // Average duration — prefer 5-min window, fall back to full buffer
  const recentDurations = recentEntries.filter((e) => e.durationMs).map((e) => e.durationMs);
  const allDurations = activityLog.filter((e) => e.durationMs).map((e) => e.durationMs);
  const durationSource = recentDurations.length > 0 ? recentDurations : allDurations;
  const avgDuration =
    durationSource.length > 0
      ? Math.round(durationSource.reduce((a, b) => a + b, 0) / durationSource.length)
      : null;

  // Token usage — 5-min window
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let entriesWithUsage = 0;

  for (const entry of recentEntries) {
    if (entry.usage) {
      entriesWithUsage++;
      totalPromptTokens += entry.usage.prompt_tokens || 0;
      totalCompletionTokens += entry.usage.completion_tokens || 0;
      totalTokens +=
        entry.usage.total_tokens ||
        (entry.usage.prompt_tokens || 0) + (entry.usage.completion_tokens || 0);
    }
  }

  let allTimeTokens = 0;
  let allTimePromptTokens = 0;
  let allTimeCompletionTokens = 0;
  let estimatedCostUSD = 0;

  for (const entry of activityLog) {
    if (entry.usage) {
      const pt = entry.usage.prompt_tokens || 0;
      const ct = entry.usage.completion_tokens || 0;
      const tt = entry.usage.total_tokens || pt + ct;
      allTimeTokens += tt;
      allTimePromptTokens += pt;
      allTimeCompletionTokens += ct;
      const rates = resolveModelRates(entry.provider, entry.model);
      estimatedCostUSD += (pt / 1000) * rates.input + (ct / 1000) * rates.output;
    }
  }

  return {
    totalEntries: activityLog.length,
    last5Minutes: recentEntries.length,
    lastMinute: lastMinute.length,
    requestsPerMinute: lastMinute.length,
    avgDurationMs: avgDuration,
    // Window-aware breakdowns (5-min when active, buffer otherwise)
    byProvider,
    byCapability,
    byStatus,
    windowLabel,
    // Full buffer breakdowns — always available regardless of recent activity
    allTime: {
      byProvider: allTimeByProvider,
      byStatus: allTimeByStatus,
      byCapability: allTimeByCapability,
    },
    tokenUsage: {
      last5Minutes: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalTokens,
        entriesWithUsage,
      },
      allTime: {
        totalTokens: allTimeTokens,
        promptTokens: allTimePromptTokens,
        completionTokens: allTimeCompletionTokens,
        entriesInBuffer: activityLog.length,
        estimatedCostUSD: Math.round(estimatedCostUSD * 10000) / 10000, // 4 decimal places
      },
    },
    persistence: {
      attempts: persistCounters.attempts,
      successes: persistCounters.successes,
      errors: persistCounters.errors,
      lastError: persistCounters.lastError,
      lastErrorAt: persistCounters.lastErrorAt,
    },
  };
}

/**
 * Snapshot of DB-persist counters. Useful for ops endpoints and alerting.
 */
export function getPersistCounters() {
  return { ...persistCounters };
}

/**
 * Clear all activity logs.
 */
export function clearLLMActivity() {
  activityLog.length = 0;
}

export default {
  logLLMActivity,
  getLLMActivity,
  getLLMActivityStats,
  clearLLMActivity,
  getPersistCounters,
  resolveModelRates,
  buildPersistPayload,
  MODEL_COST_RATES,
};
