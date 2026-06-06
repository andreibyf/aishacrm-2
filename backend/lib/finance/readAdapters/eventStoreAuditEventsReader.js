/**
 * eventStoreAuditEventsReader.js
 *
 * An `auditEventsReader` (the interface `createPgAuditEventsReader` exposes —
 * `listByType` + `count`) backed by an in-process finance event store instead of
 * a Postgres pool.
 *
 * Why this exists (editable-COA-manager Phase 4, Task 15): the projection-backed
 * read adapter folds the chart of accounts from `finance.account.*` events via
 * `auditEventsReader`. The default factory binds that reader to the PG pool. But
 * the persistent-write tests (and any caller that injects an in-memory
 * `eventStore` + `createStoreProvider` while passing a non-PG `pgPool`) have no
 * real pool — the PG reader's `pool.query` would throw, failing the COA read
 * closed (503) even though the durable events live in the injected store. This
 * adapter reads those same events straight from the injected event store, so the
 * COA read-your-write + Test/Live partition contract (design §7) holds under the
 * injected-store path exactly as it does against Postgres.
 *
 * It is selected ONLY when the caller injects an event store that exposes the
 * in-memory `query()`/`getCount()` surface AND the supplied pool is not a real
 * PG pool (no `query`). The production PG path is untouched.
 */

export function createEventStoreAuditEventsReader({ eventStore }) {
  if (!eventStore || typeof eventStore.query !== 'function') {
    throw new Error(
      'createEventStoreAuditEventsReader requires an event store with a query() method',
    );
  }
  return {
    // Mirror pgAuditEventsReader.count: count this tenant's events, partitioned
    // by the active Test/Live mode when given (null/undefined = all).
    async count(tenantId, isTestData = null) {
      if (typeof eventStore.getCount === 'function') {
        return eventStore.getCount(tenantId, isTestData);
      }
      return eventStore.query({ tenant_id: tenantId, is_test_data: isTestData }).length;
    },

    // Mirror pgAuditEventsReader.listByType: return the parsed payloads of one
    // event_type in append order, partitioned by the active Test/Live mode when
    // given. The in-memory store's query() already returns events in insertion
    // (append) order for a single type, matching the PG reader's
    // `ORDER BY created_at ASC, seq ASC`.
    async listByType(tenantId, eventType, isTestData = null) {
      const events = eventStore.query({
        tenant_id: tenantId,
        event_type: eventType,
        is_test_data: isTestData,
      });
      return events.map((e) => e.payload || {});
    },
  };
}

export default createEventStoreAuditEventsReader;
