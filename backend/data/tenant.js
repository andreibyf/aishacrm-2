/**
 * Data layer: tenant table access.
 * Raw SQL is only allowed in this module (per .cursorrules).
 */

/**
 * Fetch tenant domain and name by UUID.
 * @param {object} pgPool - PostgreSQL pool
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<{ domain: string, name: string } | null>} Single row or null
 */
export async function getTenantDomainAndName(pgPool, tenantId) {
  const result = await pgPool.query(
    `SELECT TRIM(domain) as domain, name
       FROM tenant
      WHERE id = $1
      LIMIT 1`,
    [tenantId],
  );
  return result.rows?.[0] ?? null;
}
