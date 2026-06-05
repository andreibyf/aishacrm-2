/**
 * financeEventStore.js
 *
 * In-memory, append-only event store for the Finance Ops domain.
 * All writes are in-memory only — no DB, no external provider writes.
 */

import { randomUUID } from 'node:crypto';

export class FinanceEventStoreError extends Error {
  constructor(message, code = 'FINANCE_EVENT_STORE_INVALID') {
    super(message);
    this.name = 'FinanceEventStoreError';
    this.code = code;
  }
}

// CF-4 / M-1: Bare UUID — finance.audit_events.id is a uuid column in Postgres.
// No prefix so the generated value is directly insertable into a uuid-typed column.
function generateEventId() {
  return randomUUID();
}

export function createFinanceEventStore() {
  // Internal log — array of frozen event objects
  const log = [];
  // CF-5: monotonic insertion counter used as a deterministic tie-breaker when
  // two events share the same created_at millisecond. Ensures replay() is stable
  // even without sub-millisecond clock resolution.
  let seqCounter = 0;

  function append(eventPartial) {
    if (!eventPartial || !eventPartial.tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required on every finance event',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }
    if (!eventPartial.event_type) {
      throw new FinanceEventStoreError(
        'event_type is required on every finance event',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }

    // A-3: IDEMPOTENCY POSTURE — append-always.
    // This store does NOT deduplicate on caller-supplied id. Two calls with the same id
    // produce two distinct records in the log. Callers that require exactly-once semantics
    // must guard upstream (e.g., the CF-2 duplicate approval guard in financeDomainService).
    // This posture is intentional for the in-memory scaffold: replay is audit-faithful,
    // and dedup logic belongs in the domain layer, not the event store.
    const event = Object.freeze({
      // CF-5: monotonic insertion index for stable sort tie-breaking in replay().
      // Stripped from DB persistence — this is an in-memory scaffolding detail only.
      _seq: ++seqCounter,
      // G1: Honor caller-supplied id (from createFinanceEventEnvelope) to preserve causation chains.
      // Generate only when absent.
      id: eventPartial.id || generateEventId(),
      tenant_id: eventPartial.tenant_id,
      event_type: eventPartial.event_type,
      aggregate_type: eventPartial.aggregate_type || null,
      aggregate_id: eventPartial.aggregate_id || null,
      actor_id: eventPartial.actor_id || null,
      actor_type: eventPartial.actor_type || 'human',
      source: eventPartial.source || 'finance',
      request_id: eventPartial.request_id || null,
      braid_trace_id: eventPartial.braid_trace_id || null,
      correlation_id: eventPartial.correlation_id || eventPartial.request_id || null,
      causation_id: eventPartial.causation_id || null,
      payload: eventPartial.payload || {},
      policy_decision: eventPartial.policy_decision || {},
      // Test/Live data-mode partition (slice 6a): preserve the stamped mode;
      // live (false) by default so existing callers are unaffected.
      is_test_data: eventPartial.is_test_data ?? false,
      created_at: new Date().toISOString(),
    });

    log.push(event);
    return event;
  }

  function query({
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    is_test_data,
    limit,
    fromIndex = 0,
  } = {}) {
    if (!tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required for event store queries',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }

    const filterMode = is_test_data !== undefined && is_test_data !== null;

    let results = log.slice(fromIndex).filter((evt) => {
      if (evt.tenant_id !== tenant_id) return false;
      if (event_type !== undefined && evt.event_type !== event_type) return false;
      if (aggregate_type !== undefined && evt.aggregate_type !== aggregate_type) return false;
      if (aggregate_id !== undefined && evt.aggregate_id !== aggregate_id) return false;
      // Test/Live partition (slice 6a): filter only when explicitly provided.
      if (filterMode && evt.is_test_data !== is_test_data) return false;
      return true;
    });

    if (limit !== undefined && limit !== null) {
      results = results.slice(0, limit);
    }

    return results;
  }

  function replay(tenant_id, isTestData = null) {
    if (!tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required for event store replay',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }
    // Test/Live partition (slice 6a): filter to the requested mode only when
    // supplied. null/undefined → all events (today's behaviour, unchanged).
    const filterMode = isTestData !== null && isTestData !== undefined;
    // CF-5: Sort by created_at ASC, with _seq as a deterministic tie-breaker for
    // events that share the same millisecond timestamp. This guarantees stable
    // replay ordering without sub-millisecond clock resolution.
    return log
      .filter((evt) => {
        if (evt.tenant_id !== tenant_id) return false;
        if (filterMode && evt.is_test_data !== isTestData) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.created_at < b.created_at) return -1;
        if (a.created_at > b.created_at) return 1;
        return a._seq - b._seq;
      });
  }

  function getCount(tenant_id, isTestData = null) {
    if (!tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required for event store getCount',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }
    const filterMode = isTestData !== null && isTestData !== undefined;
    return log.filter((evt) => {
      if (evt.tenant_id !== tenant_id) return false;
      if (filterMode && evt.is_test_data !== isTestData) return false;
      return true;
    }).length;
  }

  return { append, query, replay, getCount };
}

export default createFinanceEventStore;
