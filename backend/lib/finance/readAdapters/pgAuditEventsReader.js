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

    // COA Slice 1: fold a single event_type in append order (created_at, seq).
    // Used to reconstruct the tenant chart of accounts from finance.account.created
    // events in persistent mode. Returns the parsed payloads in order. Partitioned
    // by the active Test/Live mode when `isTestData` is given (Codex PR #647 P2 —
    // mirrors count(): without it, test-created accounts leak into the live chart
    // and vice versa). `null`/undefined = no partition filter (back-compat).
    async listByType(tenantId, eventType, isTestData = null) {
      const filterMode = isTestData !== null && isTestData !== undefined;
      const result = await pool.query(
        filterMode
          ? 'SELECT payload FROM finance.audit_events WHERE tenant_id = $1 AND event_type = $2 AND is_test_data = $3 ORDER BY created_at ASC, seq ASC'
          : 'SELECT payload FROM finance.audit_events WHERE tenant_id = $1 AND event_type = $2 ORDER BY created_at ASC, seq ASC',
        filterMode ? [tenantId, eventType, isTestData] : [tenantId, eventType],
      );
      return (result?.rows ?? []).map((r) =>
        typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {},
      );
    },

    // COA Phase 4 ORDERING fix: fold MULTIPLE event types in TRUE global append
    // order (created_at ASC, then seq ASC) in ONE pass. listByType reads one type
    // at a time, which loses the cross-type order of an interleaved
    // create→deactivate→reactivate stream; this returns all the matching types in
    // the single ordered sequence the event store wrote them in. Partitioned by the
    // active Test/Live mode when `isTestData` is given (null/undefined = no partition
    // filter). Returns `{ event_type, payload }` in order — event_type is carried so
    // the fold switches on it rather than GUESSING from the payload shape (Codex PR
    // #651 P2 — two concurrent finance.account.created events share a name-derived id,
    // and a shape-only fold misreads the second as a deactivation).
    async listByTypesOrdered(tenantId, eventTypes, { isTestData = null } = {}) {
      const filterMode = isTestData !== null && isTestData !== undefined;
      const result = await pool.query(
        filterMode
          ? 'SELECT event_type, payload FROM finance.audit_events WHERE tenant_id = $1 AND event_type = ANY($2) AND is_test_data = $3 ORDER BY created_at ASC, seq ASC'
          : 'SELECT event_type, payload FROM finance.audit_events WHERE tenant_id = $1 AND event_type = ANY($2) ORDER BY created_at ASC, seq ASC',
        filterMode ? [tenantId, eventTypes, isTestData] : [tenantId, eventTypes],
      );
      return (result?.rows ?? []).map((r) => ({
        event_type: r.event_type,
        payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload || {},
      }));
    },
  };
}

export default createPgAuditEventsReader;
