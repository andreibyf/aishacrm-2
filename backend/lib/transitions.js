// transitions.js - helper to record entity move/conversion events

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
  const q = `INSERT INTO entity_transitions
    (tenant_id, from_table, from_id, to_table, to_id, action, performed_by, snapshot)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`;
  const params = [
    tenant_id,
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
