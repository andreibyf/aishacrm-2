/**
 * pgAuditEventsReader.js
 *
 * Phase 4-1 — minimal per-tenant audit_events reader for the projection-backed
 * runtime/status (events-written count + lag baseline). Lazy: captures the pool
 * and only queries on read, so construction never throws. Exercised only under
 * the (operator-gated) persistent-events deploy; the default beta posture keeps
 * `ENABLE_FINANCE_PERSISTENT_EVENTS` false and never constructs this.
 */

export function createPgAuditEventsReader({ pool }) {
  if (!pool) {
    throw new Error('createPgAuditEventsReader requires a Postgres pool');
  }
  return {
    async count(tenantId, isTestData = null) {
      // Schema-qualified: the persistent event store writes/reads
      // `finance.audit_events` (financeEventStore.pg.js AUDIT_EVENTS_TABLE). A
      // bare `audit_events` would not resolve under the default search_path.
      // Codex PR #634 P2: partition by the active Test/Live mode when given, so
      // /runtime/status `counts.audit_events` matches the (partitioned) /audit-events
      // read instead of counting the opposite partition's events too. `null` = all.
      const filterMode = isTestData !== null && isTestData !== undefined;
      const result = await pool.query(
        filterMode
          ? 'SELECT count(*)::int AS n FROM finance.audit_events WHERE tenant_id = $1 AND is_test_data = $2'
          : 'SELECT count(*)::int AS n FROM finance.audit_events WHERE tenant_id = $1',
        filterMode ? [tenantId, isTestData] : [tenantId],
      );
      return Number(result?.rows?.[0]?.n ?? 0);
    },
  };
}

export default createPgAuditEventsReader;
