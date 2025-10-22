/**
 * _tenantUtils
 * Server-side function for your backend
 */

/**
 * Tenant utilities used by backend functions.
 * These helpers are lightweight and safe defaults.
 */

/**
 * Resolve tenant id from request body first, then user fields.
 * @param {object} user
 * @param {object} body
 * @returns {string|null}
 */
export function resolveTenantId(user = null, body = {}) {
  const fromBody = body?.tenant_id || body?.tenantId;
  if (fromBody && typeof fromBody === "string") {
    return fromBody.trim() || null;
  }
  const fromUser =
    user?.tenant_id ||
    user?.tenantId ||
    user?.metadata?.tenant_id ||
    user?.metadata?.tenantId;
  return (typeof fromUser === "string" ? fromUser.trim() : null) || null;
}

/**
 * Build a strict tenant filter.
 * @param {string} tenantId
 * @returns {object}
 */
export function tenantScopedFilter(tenantId) {
  if (!tenantId) {
    return { id: { $exists: false } }; // matches nothing if used accidentally
  }
  return { tenant_id: tenantId };
}

/**
 * Optionally enforce/annotate service role usage with tenant context.
 * Currently a no-op guard that returns the same client for compatibility.
 * @param {any} base44
 * @param {string} tenantId
 * @returns {any}
 */
export function bindServiceRoleTenantGuard(base44, _tenantId) {
  // Intentionally a no-op placeholder. Keep signature stable for callers.
  return base44;
}

----------------------------

export default _tenantUtils;
