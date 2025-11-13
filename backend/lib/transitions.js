// transitions.js - helper to record entity move/conversion events

async function resolveTenantIdForTransitions(pgPool, tenantSlugOrId) {
  // Some environments use TEXT slug for tenant_id, but entity_transitions.tenant_id may be UUID
  // Try to resolve the tenant UUID by slug; fall back to provided value if not found
  try {
    const res = await pgPool.query(
      'SELECT id FROM tenant WHERE tenant_id = $1 LIMIT 1',
      [tenantSlugOrId]
    );
    if (res?.rows?.length && res.rows[0].id) {
      return res.rows[0].id; // UUID
    }
  } catch {
    // Ignore lookup errors and fall back
  }
  return tenantSlugOrId;
}

export async function logEntityTransition(pgPool, {
  tenant_id,
  from_table,
  from_id,
  to_table,
  to_id,
  action,
  performed_by,
  snapshot,
}) {
  const tenantForInsert = await resolveTenantIdForTransitions(pgPool, tenant_id);
  const q = `INSERT INTO entity_transitions
    (tenant_id, from_table, from_id, to_table, to_id, action, performed_by, snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
  const params = [
    tenantForInsert,
    from_table,
    from_id,
    to_table,
    to_id,
    action,
    performed_by || null,
    snapshot || null,
  ];
  await pgPool.query(q, params);
}
