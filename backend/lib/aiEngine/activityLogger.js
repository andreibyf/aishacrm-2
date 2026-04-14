/**
 * LLM Activity Logger
 *
 * Captures all LLM calls for real-time monitoring in Settings.
 * Dual-path: in-memory rolling buffer (fast, real-time) + async DB insert (persistent, 90-day).
 * DB insert is fire-and-forget — never blocks the LLM response path.
 */

import { getSupabaseClient } from '../supabase-db.js';

const MAX_ENTRIES = 500;
const activityLog = [];

/**
 * Non-blocking DB persist for one log entry.
 * Errors are caught and swallowed — DB issues must never affect LLM throughput.
 */
async function persistToDatabase(entry) {
  try {
    const supabase = getSupabaseClient();
    if (!supabase) return; // supabase not configured, skip silently

    const { error } = await supabase.from('llm_activity_logs').insert({
      id: entry.id,
      tenant_id: entry.tenantId !== 'unknown' ? entry.tenantId : null,
      capability: entry.capability,
      provider: entry.provider,
      model: entry.model,
      node_id: entry.nodeId,
      container_id: entry.containerId,
      status: entry.status,
      duration_ms: entry.durationMs,
      error: entry.error,
      usage: entry.usage,
      tools_called: entry.toolsCalled,
      intent: entry.intent,
      task_id: entry.taskId,
      request_id: entry.requestId,
      attempt: entry.attempt,
      total_attempts: entry.totalAttempts,
      created_at: entry.timestamp,
    });

    if (error) {
      // Only log at debug level — DB persistence is best-effort
      console.debug('[LLMActivityLogger] DB persist skipped:', error.message);
    }
  } catch (err) {
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
 * @param {Object} entry
 * @param {string} entry.tenantId - Tenant UUID
 * @param {string} entry.capability - The capability used (chat_tools, json_strict, etc.)
 * @param {string} entry.provider - The LLM provider (openai, anthropic, groq, local)
 * @param {string} entry.model - The model name
 * @param {string} [entry.nodeId] - Optional node/route identifier (e.g., "mcp:llm.generate_json")
 * @param {string} [entry.status] - "success" | "error" | "failover"
 * @param {number} [entry.durationMs] - Request duration in milliseconds
 * @param {string} [entry.error] - Error message if failed
 * @param {Object} [entry.usage] - Token usage { prompt_tokens, completion_tokens }
 * @param {number} [entry.attempt] - Which attempt in failover chain (1, 2, etc.)
 * @param {number} [entry.totalAttempts] - Total attempts in failover chain
 * @param {Array<string>} [entry.toolsCalled] - Array of tool names called during this request
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

  // Token stats + cost estimates for all time (from buffer)
  // Approximate cost per 1K tokens (input/output averaged) by provider+model
  const COST_PER_1K = {
    anthropic: { input: 0.003, output: 0.015 }, // claude-sonnet-4 approximate
    openai: { input: 0.0025, output: 0.01 }, // gpt-4o approximate
    groq: { input: 0.0001, output: 0.0001 }, // llama on groq
    local: { input: 0, output: 0 },
  };

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
      const rates = COST_PER_1K[entry.provider] || COST_PER_1K.openai;
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
  };
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
};
