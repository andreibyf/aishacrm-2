// braid-rt.js — runtime primitives (Result, IO, cap enforcement, tenant isolation)
"use strict";

// Result type constructors
export const Ok = (v) => ({ tag: 'Ok', value: v });
export const Err = (e) => ({ tag: 'Err', error: e });

// Option type constructors
export const Some = (v) => ({ tag: 'Some', value: v });
export const None = { tag: 'None' };

// Capability checker with audit logging
const auditLog = [];
export const cap = (policy, eff) => {
  const audit = {
    effect: eff,
    timestamp: new Date().toISOString(),
    tenant_id: policy?.context?.tenant_id || null,
    user_id: policy?.context?.user_id || null,
    allowed: false
  };

  if (!policy) {
    audit.reason = 'No policy provided';
    auditLog.push(audit);
    throw new Error(`[BRAID_CAP] Effect '${eff}' denied: no policy`);
  }

  const allowed = policy.allow_effects?.includes(eff) || policy.allow_effects?.includes('*');
  audit.allowed = allowed;

  if (!allowed) {
    audit.reason = `Effect '${eff}' not in allow list`;
    auditLog.push(audit);
    if (policy.audit_log) console.warn(`[BRAID_AUDIT] ${JSON.stringify(audit)}`);
    throw new Error(`[BRAID_CAP] Effect '${eff}' denied by policy`);
  }

  auditLog.push(audit);
  if (policy.audit_log) console.log(`[BRAID_AUDIT] ${JSON.stringify(audit)}`);
};

// Tenant isolation wrapper (supports function or object of functions)
function withTenantIsolation(target, policy) {
  const wrapFn = (fn) => async (...args) => {
    if (policy?.tenant_isolation) {
      const tenantId = policy?.context?.tenant_id;
      if (!tenantId) throw new Error('[BRAID_TENANT] Tenant isolation enabled but no tenant_id in context');
      // Heuristic: if first arg is URL (string), options likely at index 1; else index 0
      const idx = (typeof args[0] === 'string') ? 1 : 0;
      const opts = (args[idx] && typeof args[idx] === 'object') ? args[idx] : {};
      // Inject tenant_id into params for GET and into body for POST/PUT if present
      if (!opts.params) opts.params = {};
      if (opts.params.tenant_id == null) opts.params.tenant_id = tenantId;
      args[idx] = opts;
    }
    return await fn(...args);
  };

  if (typeof target === 'function') return wrapFn(target);
  if (target && typeof target === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(target)) out[k] = withTenantIsolation(v, policy);
    return out;
  }
  return target;
}
export const IO = (policy, deps) => {
  const timeout = policy?.max_execution_ms || 30000;
  const withTimeout = (fn) => async (...args) => {
    return Promise.race([
      fn(...args),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`[BRAID_TIMEOUT] Exceeded ${timeout}ms`)), timeout)
      )
    ]);
  };

  const io = {
    fs: {
      read: withTenantIsolation(withTimeout(deps.fs?.read || (() => { throw new Error('fs.read not provided'); })), policy),
      write: withTenantIsolation(withTimeout(deps.fs?.write || (() => { throw new Error('fs.write not provided'); })), policy)
    },
    http: {
      get: withTenantIsolation(withTimeout(deps.http?.get || (() => { throw new Error('http.get not provided'); })), policy),
      post: withTenantIsolation(withTimeout(deps.http?.post || (() => { throw new Error('http.post not provided'); })), policy),
      put: withTenantIsolation(withTimeout(deps.http?.put || (() => { throw new Error('http.put not provided'); })), policy),
      delete: withTenantIsolation(withTimeout(deps.http?.delete || (() => { throw new Error('http.delete not provided'); })), policy)
    },
    clock: {
      now: deps.clock?.now || (() => new Date().toISOString()),
      sleep: withTimeout(deps.clock?.sleep || ((ms) => new Promise(r => setTimeout(r, ms))))
    },
    rng: {
      random: deps.rng?.random || Math.random,
      uuid: deps.rng?.uuid || (() => {
        throw new Error('uuid generator not provided - use crypto.randomUUID()');
      })
    }
  };
  return io;
};

// Policy templates for common CRM operations
export const CRM_POLICIES = {
  READ_ONLY: {
    allow_effects: ['net', 'clock'],  // clock needed for timestamps in snapshots
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 5000,
    // Rate limiting: requests per minute per user
    rate_limit: { requests_per_minute: 120, burst: 20 },
    // Tool class for rate limit grouping
    tool_class: 'read'
  },
  
  WRITE_OPERATIONS: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 30000,
    // Stricter rate limits for mutations
    rate_limit: { requests_per_minute: 60, burst: 10 },
    tool_class: 'write'
  },

  DELETE_OPERATIONS: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 30000,
    // Very strict rate limits for deletes
    rate_limit: { requests_per_minute: 20, burst: 5 },
    tool_class: 'delete',
    // Require confirmation for destructive operations
    requires_confirmation: true,
    // Soft delete by default, hard delete requires explicit flag
    soft_delete_default: true
  },
  
  ADMIN_ONLY: {
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    audit_log: true,
    max_execution_ms: 30000,
    // Very strict rate limits for admin operations
    rate_limit: { requests_per_minute: 30, burst: 5 },
    tool_class: 'admin',
    // Required roles to execute this tool
    required_roles: ['admin', 'superadmin'],
    // Log all admin operations to system_logs table
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

/**
 * Field-level permission masks
 * Defines which fields are hidden/masked based on user role
 */
export const FIELD_PERMISSIONS = {
  // Fields that require specific roles to view
  sensitive_fields: {
    users: ['password_hash', 'recovery_token', 'api_keys'],
    employees: ['salary', 'ssn', 'bank_account', 'tax_id'],
    contacts: ['private_notes'],
    accounts: ['internal_rating', 'credit_score']
  },
  
  // Role-based field access
  role_access: {
    superadmin: '*',  // Can see all fields
    admin: ['salary', 'internal_rating', 'credit_score'],  // Can see these sensitive fields
    manager: ['internal_rating'],  // Limited sensitive access
    user: []  // No access to sensitive fields
  }
};

/**
 * Check if a user role can access a sensitive field
 * @param {string} role - User role
 * @param {string} entity - Entity type (users, employees, etc.)
 * @param {string} field - Field name
 * @returns {boolean}
 */
export function canAccessField(role, entity, field) {
  const sensitiveFields = FIELD_PERMISSIONS.sensitive_fields[entity] || [];
  if (!sensitiveFields.includes(field)) return true; // Not a sensitive field
  
  const roleAccess = FIELD_PERMISSIONS.role_access[role];
  if (roleAccess === '*') return true; // Superadmin sees all
  return Array.isArray(roleAccess) && roleAccess.includes(field);
}

/**
 * Filter sensitive fields from a result based on user role
 * @param {Object} data - Data to filter
 * @param {string} entity - Entity type
 * @param {string} role - User role
 * @returns {Object} Filtered data
 */
export function filterSensitiveFields(data, entity, role) {
  if (!data || typeof data !== 'object') return data;
  if (role === 'superadmin') return data; // No filtering for superadmin
  
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

// Audit log access (in-memory for debugging)
export const getAuditLog = () => [...auditLog];
export const clearAuditLog = () => { auditLog.length = 0; };

/**
 * Create an audit log entry for a Braid tool execution
 * @param {Object} context - Execution context
 * @returns {Object} Audit log entry ready for database insert
 */
export function createAuditEntry({
  toolName,
  braidFunction,
  braidFile,
  policy,
  toolClass,
  tenantId,
  userId,
  userEmail,
  userRole,
  inputArgs,
  resultTag,
  resultValue,
  errorType,
  errorMessage,
  executionTimeMs,
  cacheHit = false,
  rateLimitRemaining,
  rateLimitWindow,
  ipAddress,
  userAgent,
  requestId,
  isDryRun = false,
  requiresConfirmation = false,
  confirmationProvided = false,
  entityType,
  entityId
}) {
  return {
    tenant_id: tenantId,
    user_id: userId,
    user_email: userEmail,
    user_role: userRole,
    tool_name: toolName,
    braid_function: braidFunction,
    braid_file: braidFile,
    policy: policy,
    tool_class: toolClass,
    input_args: inputArgs ? JSON.stringify(inputArgs) : '{}',
    result_tag: resultTag,
    result_value: resultValue ? JSON.stringify(resultValue) : null,
    error_type: errorType,
    error_message: errorMessage,
    execution_time_ms: executionTimeMs,
    cache_hit: cacheHit,
    rate_limit_remaining: rateLimitRemaining,
    rate_limit_window: rateLimitWindow,
    ip_address: ipAddress,
    user_agent: userAgent,
    request_id: requestId,
    is_dry_run: isDryRun,
    requires_confirmation: requiresConfirmation,
    confirmation_provided: confirmationProvided,
    entity_type: entityType,
    entity_id: entityId,
    created_at: new Date().toISOString()
  };
}

/**
 * Log a tool execution to the braid_audit_log table
 * @param {Object} supabase - Supabase client with service role
 * @param {Object} entry - Audit entry from createAuditEntry()
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function logToolExecution(supabase, entry) {
  try {
    const { error } = await supabase
      .from('braid_audit_log')
      .insert(entry);
    
    if (error) {
      console.error('[Braid Audit] Failed to log tool execution:', error.message);
      return { success: false, error: error.message };
    }
    
    return { success: true };
  } catch (err) {
    console.error('[Braid Audit] Exception logging tool execution:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Query audit logs with filters
 * @param {Object} supabase - Supabase client
 * @param {Object} filters - Query filters
 * @returns {Promise<{data: Array, error?: string}>}
 */
export async function queryAuditLogs(supabase, {
  tenantId,
  userId,
  toolName,
  policy,
  resultTag,
  startDate,
  endDate,
  limit = 100,
  offset = 0,
  orderBy = 'created_at',
  orderDir = 'desc'
}) {
  try {
    let query = supabase
      .from('braid_audit_log')
      .select('*');
    
    if (tenantId) query = query.eq('tenant_id', tenantId);
    if (userId) query = query.eq('user_id', userId);
    if (toolName) query = query.eq('tool_name', toolName);
    if (policy) query = query.eq('policy', policy);
    if (resultTag) query = query.eq('result_tag', resultTag);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);
    
    query = query
      .order(orderBy, { ascending: orderDir === 'asc' })
      .range(offset, offset + limit - 1);
    
    const { data, error } = await query;
    
    if (error) {
      return { data: [], error: error.message };
    }
    
    return { data };
  } catch (err) {
    return { data: [], error: err.message };
  }
}

/**
 * Get audit statistics for a tenant
 * @param {Object} supabase - Supabase client
 * @param {string} tenantId - Tenant UUID
 * @param {string} period - Time period: 'hour', 'day', 'week', 'month'
 * @returns {Promise<Object>} Stats object
 */
export async function getAuditStats(supabase, tenantId, period = 'day') {
  const periodMap = {
    hour: "now() - INTERVAL '1 hour'",
    day: "now() - INTERVAL '1 day'",
    week: "now() - INTERVAL '7 days'",
    month: "now() - INTERVAL '30 days'"
  };
  
  const interval = periodMap[period] || periodMap.day;
  
  try {
    // Get basic counts
    const { data: logs, error } = await supabase
      .from('braid_audit_log')
      .select('tool_name, policy, result_tag, execution_time_ms, cache_hit')
      .eq('tenant_id', tenantId)
      .gte('created_at', new Date(Date.now() - (period === 'hour' ? 3600000 : period === 'day' ? 86400000 : period === 'week' ? 604800000 : 2592000000)).toISOString());
    
    if (error || !logs) {
      return { error: error?.message || 'No data' };
    }
    
    // Calculate stats
    const totalCalls = logs.length;
    const successCalls = logs.filter(l => l.result_tag === 'Ok').length;
    const errorCalls = logs.filter(l => l.result_tag === 'Err').length;
    const cacheHits = logs.filter(l => l.cache_hit).length;
    const avgExecutionTime = logs.length > 0 
      ? Math.round(logs.reduce((sum, l) => sum + (l.execution_time_ms || 0), 0) / logs.length)
      : 0;
    
    // Group by tool
    const byTool = {};
    logs.forEach(l => {
      if (!byTool[l.tool_name]) byTool[l.tool_name] = 0;
      byTool[l.tool_name]++;
    });
    
    // Group by policy
    const byPolicy = {};
    logs.forEach(l => {
      if (!byPolicy[l.policy]) byPolicy[l.policy] = 0;
      byPolicy[l.policy]++;
    });
    
    return {
      period,
      totalCalls,
      successCalls,
      errorCalls,
      successRate: totalCalls > 0 ? Math.round((successCalls / totalCalls) * 100) : 0,
      cacheHits,
      cacheHitRate: totalCalls > 0 ? Math.round((cacheHits / totalCalls) * 100) : 0,
      avgExecutionTimeMs: avgExecutionTime,
      topTools: Object.entries(byTool).sort((a, b) => b[1] - a[1]).slice(0, 10),
      byPolicy
    };
  } catch (err) {
    return { error: err.message };
  }
}

