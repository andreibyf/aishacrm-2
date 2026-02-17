/**
 * LLM Activity Logger
 * 
 * Captures all LLM calls for real-time monitoring in Settings.
 * Stores entries in memory with a rolling buffer (last N entries).
 * Also outputs structured JSON logs for log aggregation (Loki, CloudWatch, etc.)
 */

const MAX_ENTRIES = 500;
const activityLog = [];

/**
 * Get the node/container ID from environment.
 * Useful for distinguishing between multiple MCP worker containers.
 */
export function getNodeId() {
  return process.env.MCP_NODE_ID || process.env.HOSTNAME || "backend";
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
    tenantId: entry.tenantId || "unknown",
    capability: entry.capability || "unknown",
    provider: entry.provider || "unknown",
    model: entry.model || "unknown",
    nodeId: entry.nodeId || null,
    status: entry.status || "success",
    durationMs: entry.durationMs || null,
    error: entry.error || null,
    usage: entry.usage || null,
    attempt: entry.attempt || null,
    totalAttempts: entry.totalAttempts || null,
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
  const logTag = logEntry.status === "success" 
    ? "[AIEngine][LLM_CALL_SUCCESS]" 
    : logEntry.status === "failover" 
    ? "[AIEngine][LLM_CALL_FAILOVER]"
    : "[AIEngine][LLM_CALL_ERROR]";
  
  console.log(logTag, JSON.stringify({
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
  }));
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

  const recentEntries = activityLog.filter(
    (e) => new Date(e.timestamp).getTime() > fiveMinutesAgo
  );

  const lastMinute = activityLog.filter(
    (e) => new Date(e.timestamp).getTime() > oneMinuteAgo
  );

  // Count by provider
  const byProvider = {};
  const byCapability = {};
  const byStatus = {};

  for (const entry of recentEntries) {
    byProvider[entry.provider] = (byProvider[entry.provider] || 0) + 1;
    byCapability[entry.capability] = (byCapability[entry.capability] || 0) + 1;
    byStatus[entry.status] = (byStatus[entry.status] || 0) + 1;
  }

  // Calculate average duration
  const durations = recentEntries.filter((e) => e.durationMs).map((e) => e.durationMs);
  const avgDuration = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : null;

  // Calculate token usage
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;
  let totalTokens = 0;
  let entriesWithUsage = 0;

  for (const entry of recentEntries) {
    if (entry.usage) {
      entriesWithUsage++;
      totalPromptTokens += entry.usage.prompt_tokens || 0;
      totalCompletionTokens += entry.usage.completion_tokens || 0;
      totalTokens += entry.usage.total_tokens || 
        (entry.usage.prompt_tokens || 0) + (entry.usage.completion_tokens || 0);
    }
  }

  // Token stats for all time (from buffer)
  let allTimeTokens = 0;
  for (const entry of activityLog) {
    if (entry.usage) {
      allTimeTokens += entry.usage.total_tokens || 
        (entry.usage.prompt_tokens || 0) + (entry.usage.completion_tokens || 0);
    }
  }

  return {
    totalEntries: activityLog.length,
    last5Minutes: recentEntries.length,
    lastMinute: lastMinute.length,
    requestsPerMinute: lastMinute.length,
    avgDurationMs: avgDuration,
    byProvider,
    byCapability,
    byStatus,
    tokenUsage: {
      last5Minutes: {
        promptTokens: totalPromptTokens,
        completionTokens: totalCompletionTokens,
        totalTokens: totalTokens,
        entriesWithUsage,
      },
      allTime: {
        totalTokens: allTimeTokens,
        entriesInBuffer: activityLog.length,
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
