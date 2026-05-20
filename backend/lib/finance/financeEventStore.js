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

// CF-4 / M-1: Bare UUID — finance_events.id is a uuid column in Postgres.
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
    limit,
    fromIndex = 0,
  } = {}) {
    if (!tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required for event store queries',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }

    let results = log.slice(fromIndex).filter((evt) => {
      if (evt.tenant_id !== tenant_id) return false;
      if (event_type !== undefined && evt.event_type !== event_type) return false;
      if (aggregate_type !== undefined && evt.aggregate_type !== aggregate_type) return false;
      if (aggregate_id !== undefined && evt.aggregate_id !== aggregate_id) return false;
      return true;
    });

    if (limit !== undefined && limit !== null) {
      results = results.slice(0, limit);
    }

    return results;
  }

  function replay(tenant_id) {
    if (!tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required for event store replay',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }
    // CF-5: Sort by created_at ASC, with _seq as a deterministic tie-breaker for
    // events that share the same millisecond timestamp. This guarantees stable
    // replay ordering without sub-millisecond clock resolution.
    return log
      .filter((evt) => evt.tenant_id === tenant_id)
      .sort((a, b) => {
        if (a.created_at < b.created_at) return -1;
        if (a.created_at > b.created_at) return 1;
        return a._seq - b._seq;
      });
  }

  function getCount(tenant_id) {
    if (!tenant_id) {
      throw new FinanceEventStoreError(
        'tenant_id is required for event store getCount',
        'FINANCE_EVENT_STORE_INVALID',
      );
    }
    return log.filter((evt) => evt.tenant_id === tenant_id).length;
  }

  return { append, query, replay, getCount };
}

export default createFinanceEventStore;
