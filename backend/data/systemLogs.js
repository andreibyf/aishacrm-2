/**
 * Data layer: system_logs table access.
 * Raw SQL is only allowed in this module (per .cursorrules).
 */

/**
 * Insert a security/system log row.
 * @param {object} pgPool - PostgreSQL pool
 * @param {object} params - Log fields
 * @param {string} [params.tenant_id='system'] - Tenant id
 * @param {string} [params.level='WARN'] - Log level
 * @param {string} params.message - Message
 * @param {string} [params.source] - Source identifier
 * @param {object} [params.metadata] - JSON metadata (will be stringified)
 */
export async function insertSystemLog(pgPool, params) {
  if (!pgPool) return;

  const query = `
    INSERT INTO system_logs (
      tenant_id, level, message, source, metadata, created_at
    ) VALUES (
      $1, $2, $3, $4, $5, NOW()
    )
  `;
  const values = [
    params.tenant_id ?? 'system',
    params.level ?? 'WARN',
    params.message,
    params.source ?? null,
    typeof params.metadata === 'string' ? params.metadata : JSON.stringify(params.metadata ?? {}),
  ];
  await pgPool.query(query, values);
}
