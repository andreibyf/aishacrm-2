// braid-rt.js — AiSHA CRM runtime layer
// Re-exports core Braid primitives from core/, adds CRM-specific policies,
// field permissions, and Supabase audit logging.
//
// Consumers in AiSHA (sdk/index.js, braid-adapter.js, backend/lib/braid/*)
// import from this file. The core language runtime lives in ../core/braid-rt.js.
"use strict";

// ============================================================================
// RE-EXPORT CORE PRIMITIVES
// ============================================================================

export {
  Ok,
  Err,
  Some,
  None,
  checkType,
  CRMError,
  cap,
  IO,
  POLICIES,
  createPolicy,
} from '../core/braid-rt.js';

// ============================================================================
// CRM-SPECIFIC POLICIES
// ============================================================================

// AiSHA's CRM policies extend core POLICIES with rate limits, tool classes,
// role requirements, and confirmation flags.
export const CRM_POLICIES = {
  READ_ONLY: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 5000,
    rate_limit: { requests_per_minute: 120, burst: 20 },
    tool_class: 'read'
  },

  WRITE_OPERATIONS: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 30000,
    rate_limit: { requests_per_minute: 60, burst: 10 },
    tool_class: 'write'
  },

  DELETE_OPERATIONS: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 30000,
    rate_limit: { requests_per_minute: 20, burst: 5 },
    tool_class: 'delete',
    requires_confirmation: true,
    soft_delete_default: false
  },

  ADMIN_ONLY: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 30000,
    rate_limit: { requests_per_minute: 30, burst: 5 },
    tool_class: 'admin',
    required_roles: ['admin', 'superadmin'],
    system_log: true
  },

  ADMIN_ALL: {
    allow_effects: ['*'],
    tenant_isolation: false,
    audit_log: true,
    max_execution_ms: 30000,
    rate_limit: { requests_per_minute: 10, burst: 3 },
    tool_class: 'superadmin',
    required_roles: ['superadmin'],
    system_log: true
  }
};

// ============================================================================
// FIELD-LEVEL PERMISSIONS
// ============================================================================

export const FIELD_PERMISSIONS = {
  sensitive_fields: {
    users: ['password_hash', 'recovery_token', 'api_keys'],
    employees: ['salary', 'ssn', 'bank_account', 'tax_id'],
    contacts: ['private_notes'],
    accounts: ['internal_rating', 'credit_score']
  },
  role_access: {
    superadmin: '*',
    admin: ['salary', 'internal_rating', 'credit_score'],
    manager: ['internal_rating'],
    user: []
  }
};

export function canAccessField(role, entity, field) {
  const sensitiveFields = FIELD_PERMISSIONS.sensitive_fields[entity] || [];
  if (!sensitiveFields.includes(field)) return true;
  const roleAccess = FIELD_PERMISSIONS.role_access[role];
  if (roleAccess === '*') return true;
  return Array.isArray(roleAccess) && roleAccess.includes(field);
}

export function filterSensitiveFields(data, entity, role) {
  if (!data || typeof data !== 'object') return data;
  if (role === 'superadmin') return data;
  const sensitiveFields = FIELD_PERMISSIONS.sensitive_fields[entity] || [];
  const roleAccess = FIELD_PERMISSIONS.role_access[role] || [];
  const filter = (obj) => {
    if (Array.isArray(obj)) return obj.map(filter);
    if (obj && typeof obj === 'object') {
      const filtered = {};
      for (const [key, value] of Object.entries(obj)) {
        if (sensitiveFields.includes(key) && !roleAccess.includes(key)) {
          filtered[key] = '[REDACTED]';
        } else if (typeof value === 'object') {
          filtered[key] = filter(value);
        } else {
          filtered[key] = value;
        }
      }
      return filtered;
    }
    return obj;
  };
  return filter(data);
}

// ============================================================================
// IN-MEMORY AUDIT LOG (for debugging / cap() tracing)
// ============================================================================

const auditLog = [];
export const getAuditLog = () => [...auditLog];
export const clearAuditLog = () => { auditLog.length = 0; };

// ============================================================================
// SUPABASE AUDIT LOGGING
// ============================================================================

export function createAuditEntry({
  toolName, braidFunction, braidFile, policy, toolClass,
  tenantId, userId, userEmail, userRole,
  inputArgs, resultTag, resultValue, errorType, errorMessage,
  executionTimeMs, cacheHit = false,
  rateLimitRemaining, rateLimitWindow,
  ipAddress, userAgent, requestId,
  isDryRun = false, requiresConfirmation = false, confirmationProvided = false,
  entityType, entityId
}) {
  return {
    tenant_id: tenantId, user_id: userId, user_email: userEmail, user_role: userRole,
    tool_name: toolName, braid_function: braidFunction, braid_file: braidFile,
    policy, tool_class: toolClass,
    input_args: inputArgs ? JSON.stringify(inputArgs) : '{}',
    result_tag: resultTag,
    result_value: resultValue ? JSON.stringify(resultValue) : null,
    error_type: errorType, error_message: errorMessage,
    execution_time_ms: executionTimeMs, cache_hit: cacheHit,
    rate_limit_remaining: rateLimitRemaining, rate_limit_window: rateLimitWindow,
    ip_address: ipAddress, user_agent: userAgent, request_id: requestId,
    is_dry_run: isDryRun, requires_confirmation: requiresConfirmation,
    confirmation_provided: confirmationProvided,
    entity_type: entityType, entity_id: entityId,
    created_at: new Date().toISOString()
  };
}

export async function logToolExecution(supabase, entry) {
  try {
    const { error } = await supabase.from('braid_audit_log').insert(entry);
    if (error) {
      console.error('[Braid Audit] Failed to log:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    console.error('[Braid Audit] Exception:', err.message);
    return { success: false, error: err.message };
  }
}

export async function queryAuditLogs(supabase, {
  tenantId, userId, toolName, policy, resultTag,
  startDate, endDate, limit = 100, offset = 0,
  orderBy = 'created_at', orderDir = 'desc'
}) {
  try {
    let query = supabase.from('braid_audit_log').select('*');
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (userId) query = query.eq('user_id', userId);
    if (toolName) query = query.eq('tool_name', toolName);
    if (policy) query = query.eq('policy', policy);
    if (resultTag) query = query.eq('result_tag', resultTag);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    query = query.order(orderBy, { ascending: orderDir === 'asc' }).range(offset, offset + limit - 1);
    const { data, error } = await query;
    if (error) return { data: [], error: error.message };
    return { data };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

export async function getAuditStats(supabase, tenantId, period = 'day') {
  const periodMs = { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 };
  const since = new Date(Date.now() - (periodMs[period] || periodMs.day)).toISOString();
  try {
    let query = supabase.from('braid_audit_log')
      .select('tool_name, policy, result_tag, execution_time_ms, cache_hit')
      .gte('created_at', since);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data: logs, error } = await query;
    if (error || !logs) return { error: error?.message || 'No data' };
    const totalCalls = logs.length;
    const successCalls = logs.filter(l => l.result_tag === 'Ok').length;
    const errorCalls = logs.filter(l => l.result_tag === 'Err').length;
    const cacheHits = logs.filter(l => l.cache_hit).length;
    const avgExec = totalCalls > 0 ? Math.round(logs.reduce((s, l) => s + (l.execution_time_ms || 0), 0) / totalCalls) : 0;
    const byTool = {}, byPolicy = {};
    logs.forEach(l => { byTool[l.tool_name] = (byTool[l.tool_name] || 0) + 1; byPolicy[l.policy] = (byPolicy[l.policy] || 0) + 1; });
    return {
      period, totalCalls, successCalls, errorCalls,
      successRate: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0,
      cacheHits, cacheHitRate: totalCalls > 0 ? Math.round((cacheHits / totalCalls) * 100) : 0,
      avgExecutionTimeMs: avgExec,
      topTools: Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 10),
      byPolicy
    };
  } catch (err) { return { error: err.message }; }
}

export async function getToolMetrics(supabase, tenantId, period = 'day') {
  const periodMs = { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 };
  const since = new Date(Date.now() - (periodMs[period] || periodMs.day)).toISOString();
  try {
    let query = supabase.from('braid_audit_log')
      .select('tool_name, policy, result_tag, execution_time_ms, cache_hit, error_type, created_at')
      .gte('created_at', since).order('created_at', { ascending: false });
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data: logs, error } = await query;
    if (error) return { error: error.message };
    if (!logs || logs.length === 0) return { tools: [], summary: {} };
    const toolStats = {};
    logs.forEach(log => {
      const t = log.tool_name;
      if (!toolStats[t]) toolStats[t] = { name: t, policy: log.policy, calls: 0, successes: 0, errors: 0, cacheHits: 0, totalLatency: 0, latencies: [], errorTypes: {}, lastUsed: null };
      const s = toolStats[t]; s.calls++;
      if (log.result_tag === 'Ok') s.successes++;
      if (log.result_tag === 'Err') { s.errors++; s.errorTypes[log.error_type || 'Unknown'] = (s.errorTypes[log.error_type || 'Unknown'] || 0) + 1; }
      if (log.cache_hit) s.cacheHits++;
      if (log.execution_time_ms) { s.totalLatency += log.execution_time_ms; s.latencies.push(log.execution_time_ms); }
      if (!s.lastUsed || log.created_at > s.lastUsed) s.lastUsed = log.created_at;
    });
    const tools = Object.values(toolStats).map(t => {
      const avg = t.calls > 0 ? Math.round(t.totalLatency / t.calls) : 0;
      const sr = t.calls > 0 ? (t.successes / t.calls) * 100 : 100;
      const chr = t.calls > 0 ? (t.cacheHits / t.calls) * 100 : 0;
      const sorted = t.latencies.sort((a, b) => a - b);
      const p95 = sorted[Math.floor(sorted.length * 0.95)] || avg;
      let hs = 100; hs -= Math.max(0, (100 - sr) * 2); hs -= Math.max(0, Math.floor((avg - 500) / 100) * 10); hs = Math.max(0, Math.min(100, Math.round(hs)));
      return { name: t.name, policy: t.policy, calls: t.calls, successRate: Math.round(sr * 10) / 10, errorRate: Math.round((100 - sr) * 10) / 10, cacheHitRate: Math.round(chr * 10) / 10, avgLatencyMs: avg, p95LatencyMs: p95, errorTypes: t.errorTypes, lastUsed: t.lastUsed, healthScore: hs, healthStatus: hs >= 90 ? 'healthy' : hs >= 70 ? 'degraded' : hs >= 50 ? 'warning' : 'critical' };
    }).sort((a, b) => b.calls - a.calls);
    const total = logs.length, errs = logs.filter(l => l.result_tag === 'Err').length;
    const avgSys = total > 0 ? Math.round(logs.reduce((s, l) => s + (l.execution_time_ms || 0), 0) / total) : 0;
    return { period, generatedAt: new Date().toISOString(), summary: { totalCalls: total, totalErrors: errs, systemSuccessRate: total > 0 ? Math.round(((total - errs) / total) * 100) : 100, avgSystemLatencyMs: avgSys, uniqueTools: tools.length, healthyTools: tools.filter(t => t.healthStatus === 'healthy').length, degradedTools: tools.filter(t => t.healthStatus !== 'healthy').length }, tools };
  } catch (err) { return { error: err.message }; }
}

export async function getMetricsTimeSeries(supabase, tenantId, granularity = 'hour', points = 24) {
  const granMs = { minute: 60000, hour: 3600000, day: 86400000 };
  const interval = granMs[granularity] || granMs.hour;
  const since = new Date(Date.now() - (interval * points)).toISOString();
  try {
    let query = supabase.from('braid_audit_log')
      .select('result_tag, execution_time_ms, cache_hit, created_at')
      .gte('created_at', since).order('created_at', { ascending: true });
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data: logs, error } = await query;
    if (error) return { error: error.message };
    const buckets = {}, now = Date.now();
    for (let i = 0; i < points; i++) { const k = new Date(now - (interval * (points - 1 - i))).toISOString(); buckets[k] = { timestamp: k, calls: 0, errors: 0, cacheHits: 0, totalLatency: 0 }; }
    (logs || []).forEach(log => {
      const idx = Math.floor((new Date(log.created_at).getTime() - (now - interval * points)) / interval);
      const keys = Object.keys(buckets); const k = keys[Math.min(Math.max(0, idx), keys.length - 1)];
      if (buckets[k]) { buckets[k].calls++; if (log.result_tag === 'Err') buckets[k].errors++; if (log.cache_hit) buckets[k].cacheHits++; buckets[k].totalLatency += log.execution_time_ms || 0; }
    });
    const series = Object.values(buckets).map(b => ({ timestamp: b.timestamp, calls: b.calls, errors: b.errors, cacheHits: b.cacheHits, avgLatencyMs: b.calls > 0 ? Math.round(b.totalLatency / b.calls) : 0, successRate: b.calls > 0 ? Math.round(((b.calls - b.errors) / b.calls) * 100) : 100 }));
    return { granularity, points, generatedAt: new Date().toISOString(), series };
  } catch (err) { return { error: err.message }; }
}

export async function getErrorAnalysis(supabase, tenantId, period = 'day') {
  const periodMs = { hour: 3600000, day: 86400000, week: 604800000, month: 2592000000 };
  const since = new Date(Date.now() - (periodMs[period] || periodMs.day)).toISOString();
  try {
    let query = supabase.from('braid_audit_log')
      .select('tool_name, policy, error_type, error_message, user_email, created_at')
      .eq('result_tag', 'Err').gte('created_at', since).order('created_at', { ascending: false }).limit(100);
    if (tenantId) query = query.eq('tenant_id', tenantId);
    const { data: errors, error } = await query;
    if (error) return { error: error.message };
    const byType = {}, byTool = {};
    (errors || []).forEach(e => {
      const type = e.error_type || 'Unknown', tool = e.tool_name;
      if (!byType[type]) byType[type] = { count: 0, tools: new Set(), examples: [] };
      byType[type].count++; byType[type].tools.add(tool);
      if (byType[type].examples.length < 3) byType[type].examples.push({ tool, message: e.error_message?.substring(0, 200), timestamp: e.created_at });
      if (!byTool[tool]) byTool[tool] = { count: 0, types: {} };
      byTool[tool].count++; byTool[tool].types[type] = (byTool[tool].types[type] || 0) + 1;
    });
    Object.values(byType).forEach(v => { v.tools = Array.from(v.tools); });
    return {
      period, totalErrors: errors?.length || 0,
      byType: Object.entries(byType).map(([type, data]) => ({ type, ...data })).sort((a, b) => b.count - a.count),
      byTool: Object.entries(byTool).map(([tool, data]) => ({ tool, ...data })).sort((a, b) => b.count - a.count).slice(0, 10),
      recentErrors: (errors || []).slice(0, 10).map(e => ({ tool: e.tool_name, type: e.error_type, message: e.error_message?.substring(0, 200), user: e.user_email, timestamp: e.created_at }))
    };
  } catch (err) { return { error: err.message }; }
}
