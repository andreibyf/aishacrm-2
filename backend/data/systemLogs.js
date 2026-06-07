/**
 * Data layer: system_logs table access.
 * Raw SQL is only allowed in this module (per .cursorrules).
 */
import { sanitizeUuidInput } from '../lib/uuidValidator.js';

function resolveSystemLogTenantId(rawTenantId) {
  const sanitizedTenantId = sanitizeUuidInput(rawTenantId ?? 'system');
  if (sanitizedTenantId) {
    return sanitizedTenantId;
  }

  if (process.env.SYSTEM_TENANT_ID) {
    return sanitizeUuidInput(process.env.SYSTEM_TENANT_ID);
  }

  return null;
}

/**
 * Insert a security/system log row.
 * @param {object} pgPool - PostgreSQL pool
 * @param {object} params - Log fields
 * @param {string} [params.tenant_id='system'] - Tenant id (UUID, system alias, or omitted)
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
    resolveSystemLogTenantId(params.tenant_id),
    params.level ?? 'WARN',
    params.message,
    params.source ?? null,
    typeof params.metadata === 'string' ? params.metadata : JSON.stringify(params.metadata ?? {}),
  ];
  await pgPool.query(query, values);
}
