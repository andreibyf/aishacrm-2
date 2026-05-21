/**
 * financeEventStore.pg.js
 *
 * Phase 2B — Postgres persistence adapter for the Finance Ops event store.
 *
 * Backing table: finance.audit_events (created in migration 168, hardened
 * append-only in migration 169). This table IS the Phase 2B persistent event
 * store — the canonical Postgres-backed finance event stream, not merely an
 * audit side table. It remains the event backbone until/unless a dedicated
 * event bus (Kafka/NATS) is adopted later.
 *
 * This adapter mirrors the in-memory `financeEventStore.js` interface
 * (`append`, `query`, `replay`, `getCount`) so it can be swapped in later
 * without changing callers. The in-memory store remains the default for
 * tests and local fallback; this adapter is not yet wired into
 * financeDomainService.
 *
 * Contract (frozen Track A):
 *  - Event IDs are bare UUIDs; caller-supplied IDs are honored.
 *  - created_at is DB-assigned (`default now()`) — the DB clock is the
 *    single source of truth for replay ordering.
 *  - Replay order is created_at ASC, with id (uuid) as a deterministic
 *    tie-break.
 *  - Append is insert-only. There is no update/delete/upsert path.
 *  - The store does not deduplicate: idempotency is a domain-layer concern.
 */

import { randomUUID } from 'node:crypto';
import { FinanceEventStoreError } from './financeEventStore.js';

const AUDIT_EVENTS_TABLE = 'finance.audit_events';

// INSERT column order. created_at is intentionally absent — it is filled by
// the column's `default now()` so the DB clock owns replay ordering.
const INSERT_COLUMNS = [
  'id',
  'tenant_id',
  'event_type',
  'aggregate_type',
  'aggregate_id',
  'actor_id',
  'actor_type',
  'source',
  'request_id',
  'braid_trace_id',
  'correlation_id',
  'causation_id',
  'payload',
  'policy_decision',
];

function invalid(message) {
  return new FinanceEventStoreError(message, 'FINANCE_EVENT_STORE_INVALID');
}

function dbError(operation, cause) {
  return new FinanceEventStoreError(
    `Failed to ${operation} finance event(s): ${cause.message}`,
    'FINANCE_EVENT_STORE_DB_ERROR',
  );
}

// Canonical event taxonomy: event_type must be a finance.* event name, never a
// command name (commands belong in payload.command_type / policy metadata).
function assertCanonicalEventType(eventType) {
  if (!eventType) {
    throw invalid('event_type is required on every finance event');
  }
  if (/Command$/.test(eventType)) {
    throw invalid(
      `event_type must be a canonical finance.* event name, not a command name: "${eventType}"`,
    );
  }
  if (!/^finance\./.test(eventType)) {
    throw invalid(
      `event_type must use the canonical finance.* taxonomy: "${eventType}"`,
    );
  }
}

/**
 * @param {object}  deps
 * @param {{ query: Function }} deps.pool  A pg Pool (or anything exposing query()).
 */
export function createFinancePgEventStore({ pool } = {}) {
  if (!pool || typeof pool.query !== 'function') {
    throw invalid('createFinancePgEventStore requires a pg pool with a query() method');
  }

  /**
   * Append exactly one immutable event row. Honors a caller-supplied id;
   * generates a bare UUID when absent. created_at is DB-assigned.
   */
  async function append(eventPartial) {
    if (!eventPartial || !eventPartial.tenant_id) {
      throw invalid('tenant_id is required on every finance event');
    }
    assertCanonicalEventType(eventPartial.event_type);

    const values = [
      // G1: honor caller-supplied id (causation chains); generate when absent.
      eventPartial.id || randomUUID(),
      eventPartial.tenant_id,
      eventPartial.event_type,
      eventPartial.aggregate_type ?? null,
      eventPartial.aggregate_id ?? null,
      eventPartial.actor_id ?? null,
      eventPartial.actor_type ?? 'human',
      eventPartial.source ?? 'finance',
      eventPartial.request_id ?? null,
      eventPartial.braid_trace_id ?? null,
      eventPartial.correlation_id ?? eventPartial.request_id ?? null,
      eventPartial.causation_id ?? null,
      JSON.stringify(eventPartial.payload ?? {}),
      JSON.stringify(eventPartial.policy_decision ?? {}),
    ];
    const placeholders = INSERT_COLUMNS.map((_, i) => `$${i + 1}`).join(', ');
    const text =
      `insert into ${AUDIT_EVENTS_TABLE} (${INSERT_COLUMNS.join(', ')}) ` +
      `values (${placeholders}) returning *`;

    let result;
    try {
      result = await pool.query(text, values);
    } catch (err) {
      // The id primary key rejected a duplicate (SQLSTATE 23505). The store does
      // not deduplicate (no ON CONFLICT / upsert) — it surfaces the conflict so
      // the domain layer owns the retry decision.
      if (err && err.code === '23505') {
        throw new FinanceEventStoreError(
          `A finance event with id ${values[0]} already exists`,
          'FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID',
        );
      }
      // Surface other failures — never silently retry, upsert, or update.
      throw dbError('append', err);
    }
    // Frozen for parity with the in-memory store: the returned event is a
    // read-only snapshot of the immutable row.
    return Object.freeze(result.rows[0]);
  }

  /**
   * Query tenant-scoped events with optional equality filters, ordered
   * created_at ASC, id ASC.
   */
  async function query({ tenant_id, event_type, aggregate_type, aggregate_id, limit } = {}) {
    if (!tenant_id) {
      throw invalid('tenant_id is required for event store queries');
    }
    const conditions = ['tenant_id = $1'];
    const values = [tenant_id];
    if (event_type !== undefined) {
      values.push(event_type);
      conditions.push(`event_type = $${values.length}`);
    }
    if (aggregate_type !== undefined) {
      values.push(aggregate_type);
      conditions.push(`aggregate_type = $${values.length}`);
    }
    if (aggregate_id !== undefined) {
      values.push(aggregate_id);
      conditions.push(`aggregate_id = $${values.length}`);
    }
    let text =
      `select * from ${AUDIT_EVENTS_TABLE} where ${conditions.join(' and ')} ` +
      `order by created_at asc, id asc`;
    if (limit !== undefined && limit !== null) {
      values.push(limit);
      text += ` limit $${values.length}`;
    }

    try {
      const result = await pool.query(text, values);
      return result.rows;
    } catch (err) {
      throw dbError('query', err);
    }
  }

  /**
   * Replay the full tenant event stream in deterministic order:
   * created_at ASC, with id (uuid) as the tie-break.
   */
  async function replay(tenant_id) {
    if (!tenant_id) {
      throw invalid('tenant_id is required for event store replay');
    }
    const text =
      `select * from ${AUDIT_EVENTS_TABLE} where tenant_id = $1 ` +
      `order by created_at asc, id asc`;
    try {
      const result = await pool.query(text, [tenant_id]);
      return result.rows;
    } catch (err) {
      throw dbError('replay', err);
    }
  }

  /** Count tenant-scoped events. */
  async function getCount(tenant_id) {
    if (!tenant_id) {
      throw invalid('tenant_id is required for event store getCount');
    }
    const text = `select count(*)::int as count from ${AUDIT_EVENTS_TABLE} where tenant_id = $1`;
    try {
      const result = await pool.query(text, [tenant_id]);
      return result.rows[0].count;
    } catch (err) {
      throw dbError('count', err);
    }
  }

  // Append-only: no update, delete, upsert, or clear method is exposed.
  return { append, query, replay, getCount };
}

export default createFinancePgEventStore;
