// @ts-check
/**
 * requireEmployee — gate routes that act on behalf of the tenant
 * (Send Document for signature, etc.) to users who have a matching
 * `employees` row on the active tenant.
 *
 * Why this exists
 * ===============
 * Some tenant users are not employees — clients, customer-portal logins,
 * external collaborators. They can authenticate, but they shouldn't be
 * able to send documents for signature on behalf of the tenant. The
 * system already enforces this implicitly via the `activities.assigned_to`
 * FK (which targets `employees.id`), but the failure mode is silent:
 * non-employees get an activity row with `assigned_to = NULL` instead of
 * a clear 403.
 *
 * This middleware turns the implicit contract into an explicit one.
 *
 * Contract
 * ========
 * After this middleware runs, `req.user.employee_id` is set to the
 * matching `employees.id` for the active tenant. Downstream code can
 * use it without re-querying.
 *
 * On failure: 403 with `code: 'employee_required'` so the frontend can
 * render a clear message ("Ask an admin to add you to the Employees
 * page on this tenant") instead of a generic permission error.
 *
 * Prerequisites
 * =============
 * - `req.user` populated by `authenticate.js` (id, email, tenant_id)
 * - `req.tenant?.id` populated by `validateTenantAccess`, OR fall back
 *   to `req.user.tenant_id`
 *
 * DI seam
 * =======
 * `createRequireEmployee({ getSupabaseAdmin })` mirrors the pattern used
 * by `createSubmissionsRoutes` so tests can inject a fake supabase
 * client and pin all branches without spinning up Postgres.
 *
 * See docs/architecture/IDENTITY_MODEL.md rule #6 for the rationale.
 *
 * @module backend/middleware/requireEmployee
 */

import { getSupabaseAdmin as defaultGetSupabaseAdmin } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';

/**
 * @typedef {Object} RequireEmployeeDeps
 * @property {() => any} [getSupabaseAdmin]  override (for tests)
 */

/**
 * Resolve the tenant ID the route is operating on, preferring the
 * canonical `req.tenant.id` set by validateTenantAccess and falling
 * back to `req.user.tenant_id` if validateTenantAccess hasn't run yet.
 *
 * @param {{ tenant?: { id?: string }, user?: { tenant_id?: string } }} req
 * @returns {string|null}
 */
function resolveTenantId(req) {
  const fromValidator = req.tenant?.id;
  if (typeof fromValidator === 'string' && fromValidator.length > 0) {
    return fromValidator;
  }
  const fromUser = req.user?.tenant_id;
  if (typeof fromUser === 'string' && fromUser.length > 0) {
    return fromUser;
  }
  return null;
}

/**
 * Factory: returns the middleware function. Use `createRequireEmployee()`
 * in route wiring; use `createRequireEmployee({ getSupabaseAdmin: fake })`
 * in tests.
 *
 * @param {RequireEmployeeDeps} [deps]
 * @returns {import('express').RequestHandler}
 */
export function createRequireEmployee(deps = {}) {
  const supabaseAdminFn = deps.getSupabaseAdmin || defaultGetSupabaseAdmin;

  return async function requireEmployee(req, res, next) {
    // Local-dev bypass mirrors the pattern in validateTenant.js so a
    // developer running without auth doesn't get blocked on every PR.
    if (!req.user && process.env.NODE_ENV === 'development') {
      req.user = {
        id: 'local-dev-superadmin',
        email: 'dev@localhost',
        role: 'superadmin',
        tenant_id: null,
        employee_id: null,
      };
      return next();
    }

    if (!req.user) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const tenantId = resolveTenantId(req);
    if (!tenantId) {
      return res.status(400).json({
        status: 'error',
        message: 'tenant_id is required',
        code: 'tenant_required',
      });
    }

    const email = typeof req.user.email === 'string' ? req.user.email.trim() : '';
    if (!email) {
      return res.status(403).json({
        status: 'error',
        message: 'Only employees can perform this action on this tenant',
        code: 'employee_required',
      });
    }

    let supabase;
    try {
      supabase = supabaseAdminFn();
    } catch (err) {
      logger.error('[requireEmployee] getSupabaseAdmin failed', {
        message: err?.message,
      });
      return res.status(500).json({
        status: 'error',
        message: 'Internal error',
      });
    }

    try {
      // Case-insensitive email match per RFC 5321 (email local-part
      // case-sensitivity is theoretically RFC-allowed but no real-world
      // mail system enforces it). Same pattern as resolveAssignedTo.
      const { data, error } = await supabase
        .from('employees')
        .select('id')
        .eq('tenant_id', tenantId)
        .ilike('email', email)
        .limit(1)
        .maybeSingle();

      if (error) {
        logger.error('[requireEmployee] employees lookup failed', {
          tenantId,
          email,
          message: error.message,
        });
        return res.status(500).json({
          status: 'error',
          message: 'Internal error',
        });
      }

      if (!data) {
        return res.status(403).json({
          status: 'error',
          message:
            'Only employees can perform this action on this tenant. ' +
            'Ask an admin to add you to the Employees page.',
          code: 'employee_required',
        });
      }

      // Pass the resolved employees.id downstream so handlers don't
      // have to re-query.
      req.user.employee_id = data.id;
      return next();
    } catch (err) {
      logger.error('[requireEmployee] threw', {
        tenantId,
        email,
        message: err?.message,
      });
      return res.status(500).json({
        status: 'error',
        message: 'Internal error',
      });
    }
  };
}

/**
 * Default-wired middleware for direct use without DI.
 *
 * @type {import('express').RequestHandler}
 */
export const requireEmployee = createRequireEmployee();
