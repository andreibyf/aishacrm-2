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

// Audit log access
export const getAuditLog = () => [...auditLog];
export const clearAuditLog = () => { auditLog.length = 0; };
