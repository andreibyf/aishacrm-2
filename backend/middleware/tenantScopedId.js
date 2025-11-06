/**
 * Tenant-scoped GET-by-id helper middleware and utilities
 *
 * Centralizes the common pattern used by many routes:
 *   When a tenant_id is provided in the query, ensure the row with :id also
 *   matches that tenant_id. Otherwise, fall back to plain id lookup.
 *
 * This middleware does NOT perform authorization. Pair it with validateTenantAccess.
 *
 * Usage in a route:
 *   import { tenantScopedId, buildGetByIdSQL } from '../middleware/tenantScopedId.js';
 *   
 *   router.get('/:id', tenantScopedId(), async (req, res) => {
 *     const { text, params } = buildGetByIdSQL('contacts', req.idScope);
 *     const result = await pgPool.query(text, params);
 *     ...
 *   });
 */

/**
 * Middleware that attaches an id/tenant-aware scope descriptor onto the request
 *
 * @param {Object} [opts]
 * @param {string} [opts.idParam='id'] - The name of the route param holding the record id
 * @param {string} [opts.tenantQueryKey='tenant_id'] - The name of the query string key for tenant id
 * @param {string} [opts.attachAs='idScope'] - The property name on req to attach the scope info
 * @returns {import('express').RequestHandler}
 */
export function tenantScopedId(opts = {}) {
  const {
    idParam = 'id',
    tenantQueryKey = 'tenant_id',
    attachAs = 'idScope',
  } = opts;

  return function tenantScopedIdMiddleware(req, res, next) {
    const id = req.params?.[idParam];
    if (!id) {
      return res.status(400).json({
        status: 'error',
        message: `Missing required route param: ${idParam}`,
      });
    }

    const tenant_id = req.query?.[tenantQueryKey];

    // Describe the scope to help routes assemble SQL consistently
    req[attachAs] = {
      id,
      tenant_id: tenant_id ?? undefined,
      // IMPORTANT: Apply tenant filter first to avoid any adapter order quirks
      where: tenant_id ? `${tenantQueryKey} = $1 AND id = $2` : 'id = $1',
      params: tenant_id ? [tenant_id, id] : [id],
    };

    next();
  };
}

/**
 * Builds a SELECT ... WHERE clause using an idScope attached by tenantScopedId
 *
 * @param {string} table - Table name
 * @param {{where:string, params:any[]}} idScope - The scope produced by tenantScopedId
 * @param {string|string[]} [columns='*'] - Column list for SELECT
 * @returns {{ text: string, params: any[] }} - Query text and params
 */
export function buildGetByIdSQL(table, idScope, columns = '*') {
  const cols = Array.isArray(columns) ? columns.join(', ') : columns;
  return {
    text: `SELECT ${cols} FROM ${table} WHERE ${idScope.where} LIMIT 1`,
    params: idScope.params,
  };
}

export default {
  tenantScopedId,
  buildGetByIdSQL,
};
