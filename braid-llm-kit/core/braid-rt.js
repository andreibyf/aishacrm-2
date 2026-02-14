// braid-rt.js — Braid language runtime kernel
// Core primitives: Result, Option, capability enforcement, IO sandbox, type checking
// This file is the ONLY runtime dependency for transpiled .braid code.
// It contains zero application-specific logic — adapters bring their own policies and deps.
"use strict";

// ============================================================================
// 1. ALGEBRAIC DATA TYPES
// ============================================================================

/** @returns {{ tag: 'Ok', value: T }} */
export const Ok = (v) => ({ tag: 'Ok', value: v });

/** @returns {{ tag: 'Err', error: E }} */
export const Err = (e) => ({ tag: 'Err', error: e });

/** @returns {{ tag: 'Some', value: T }} */
export const Some = (v) => ({ tag: 'Some', value: v });

/** @type {{ tag: 'None' }} */
export const None = Object.freeze({ tag: 'None' });

// ============================================================================
// 2. RUNTIME TYPE VALIDATION
// ============================================================================

/**
 * Validate a parameter's type at runtime. Emitted by the transpiler for typed params.
 * @param {string} fnName - Function name (for error context)
 * @param {string} paramName - Parameter name
 * @param {*} value - Actual value
 * @param {string} expected - Expected typeof string ('string', 'number', 'boolean')
 * @throws {Error} With code 'BRAID_TYPE' if validation fails
 */
export function checkType(fnName, paramName, value, expected) {
  if (value === null || value === undefined) {
    throw Object.assign(
      new Error(`[BRAID_TYPE] ${fnName}(): '${paramName}' is ${value}, expected ${expected}`),
      { code: 'BRAID_TYPE', fn: fnName, param: paramName, expected, actual: String(value) }
    );
  }
  const actual = typeof value;
  if (actual !== expected) {
    throw Object.assign(
      new Error(`[BRAID_TYPE] ${fnName}(): '${paramName}' expected ${expected}, got ${actual}`),
      { code: 'BRAID_TYPE', fn: fnName, param: paramName, expected, actual }
    );
  }
}

// ============================================================================
// 3. STRUCTURED ERROR CONSTRUCTORS
// ============================================================================

/**
 * Domain error constructors. Each returns an Err-tagged result with a typed error.
 * `fromHTTP` is the primary constructor: it maps HTTP status codes to semantic types.
 */
export const CRMError = {
  notFound(entity, id, operation) {
    return Err({ type: 'NotFound', entity, id, operation, code: 404 });
  },
  validation(fn, field, message) {
    return Err({ type: 'ValidationError', fn, field, message, code: 400 });
  },
  forbidden(operation, role, required) {
    return Err({ type: 'PermissionDenied', operation, role, required, code: 403 });
  },
  network(url, code, operation) {
    return Err({ type: 'NetworkError', url, code: code || 500, operation });
  },
  fromHTTP(url, status, operation) {
    if (status === 404) return CRMError.notFound(null, null, operation);
    if (status === 400) return CRMError.validation(operation, null, `HTTP 400`);
    if (status === 401 || status === 403) return CRMError.forbidden(operation, null, null);
    return CRMError.network(url, status, operation);
  },
};

// ============================================================================
// 4. CAPABILITY ENFORCEMENT
// ============================================================================

/**
 * Assert that a policy permits a given effect.
 * Called at the top of every effectful function: `cap(policy, "net")`.
 * @param {Object} policy - Policy object with `allow_effects` array
 * @param {string} effect - Effect name ('net', 'clock', 'fs', 'rng')
 * @throws {Error} With code 'BRAID_CAP' if effect is denied
 */
export function cap(policy, effect) {
  if (!policy) {
    throw Object.assign(
      new Error(`[BRAID_CAP] Effect '${effect}' denied: no policy provided`),
      { code: 'BRAID_CAP', effect, reason: 'no_policy' }
    );
  }

  const allowed = policy.allow_effects?.includes(effect)
    || policy.allow_effects?.includes('*');

  if (!allowed) {
    throw Object.assign(
      new Error(`[BRAID_CAP] Effect '${effect}' denied by policy`),
      { code: 'BRAID_CAP', effect, reason: 'not_in_allow_list',
        policy_effects: policy.allow_effects }
    );
  }

  // Audit callback (if provided by the adapter)
  if (typeof policy.onCapCheck === 'function') {
    policy.onCapCheck({ effect, allowed: true, timestamp: Date.now() });
  }
}

// ============================================================================
// 5. IO SANDBOX
// ============================================================================

/**
 * Create a sandboxed IO object from policy + dependencies.
 * - Wraps every IO function with timeout enforcement
 * - Injects tenant_id into HTTP params/body when tenant_isolation is enabled
 * - Provides clock, fs, rng through the same sandbox
 *
 * Transpiled code receives this as: `const { http, clock, fs, rng } = IO(policy, deps);`
 *
 * @param {Object} policy - Security policy
 * @param {Object} deps - Effect implementations provided by the adapter
 * @returns {Object} Sandboxed IO object
 */
export function IO(policy, deps) {
  const timeout = policy?.max_execution_ms || 30000;

  const withTimeout = (fn, label) => async (...args) => {
    return Promise.race([
      fn(...args),
      new Promise((_, reject) =>
        setTimeout(() => reject(
          Object.assign(
            new Error(`[BRAID_TIMEOUT] ${label || 'operation'} exceeded ${timeout}ms`),
            { code: 'BRAID_TIMEOUT', timeout }
          )
        ), timeout)
      )
    ]);
  };

  const withTenant = (fn) => {
    if (!policy?.tenant_isolation) return fn;
    return async (...args) => {
      const tenantId = policy?.context?.tenant_id;
      if (!tenantId) {
        throw Object.assign(
          new Error('[BRAID_TENANT] Tenant isolation enabled but no tenant_id in policy context'),
          { code: 'BRAID_TENANT' }
        );
      }
      // Heuristic: if first arg is a string (URL), options are at index 1
      const idx = (typeof args[0] === 'string') ? 1 : 0;
      const opts = (args[idx] && typeof args[idx] === 'object') ? { ...args[idx] } : {};
      if (!opts.params) opts.params = {};
      if (opts.params.tenant_id == null) opts.params.tenant_id = tenantId;
      args[idx] = opts;
      return fn(...args);
    };
  };

  const guard = (fn, label) => withTenant(withTimeout(fn, label));
  const deny = (name) => () => {
    throw Object.assign(
      new Error(`[BRAID_CAP] ${name} not provided by adapter`),
      { code: 'BRAID_CAP', effect: name }
    );
  };

  return {
    http: {
      get:    guard(deps?.http?.get    || deny('http.get'),    'http.get'),
      post:   guard(deps?.http?.post   || deny('http.post'),   'http.post'),
      put:    guard(deps?.http?.put    || deny('http.put'),    'http.put'),
      delete: guard(deps?.http?.delete || deny('http.delete'), 'http.delete'),
    },
    clock: {
      now:   deps?.clock?.now   || (() => new Date().toISOString()),
      sleep: withTimeout(deps?.clock?.sleep || ((ms) => new Promise(r => setTimeout(r, ms))), 'clock.sleep'),
    },
    fs: {
      read:  guard(deps?.fs?.read  || deny('fs.read'),  'fs.read'),
      write: guard(deps?.fs?.write || deny('fs.write'), 'fs.write'),
    },
    rng: {
      random: deps?.rng?.random || Math.random,
      uuid:   deps?.rng?.uuid   || deny('rng.uuid'),
    },
  };
}

// ============================================================================
// 6. POLICY TEMPLATES
// ============================================================================

/**
 * Standard policy templates. Adapters can use these directly or extend them.
 * Each policy defines: allowed effects, tenant isolation, execution limits.
 */
export const POLICIES = {
  READ_ONLY: Object.freeze({
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    max_execution_ms: 5000,
  }),

  WRITE: Object.freeze({
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    max_execution_ms: 30000,
  }),

  DELETE: Object.freeze({
    allow_effects: ['net', 'clock'],
    tenant_isolation: true,
    max_execution_ms: 30000,
  }),

  ADMIN: Object.freeze({
    allow_effects: ['net', 'clock', 'fs'],
    tenant_isolation: true,
    max_execution_ms: 60000,
  }),

  /** Unrestricted — only for system-internal service calls */
  SYSTEM: Object.freeze({
    allow_effects: ['*'],
    tenant_isolation: false,
    max_execution_ms: 120000,
  }),
};

/**
 * Create a policy with user context attached.
 * @param {string} template - Policy template name from POLICIES
 * @param {{ tenant_id: string, user_id?: string }} context
 * @param {Object} overrides - Additional policy fields
 * @returns {Object} Policy object ready for cap() and IO()
 */
export function createPolicy(template, context, overrides = {}) {
  const base = POLICIES[template];
  if (!base) throw new Error(`Unknown policy template: ${template}`);
  return { ...base, context, ...overrides };
}
