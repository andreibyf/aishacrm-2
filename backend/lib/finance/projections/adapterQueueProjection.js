/**
 * adapterQueueProjection.js
 *
 * Phase 2B-10 — Adapter Queue projection worker. The operational bridge
 * between finance events and the adapter-job lifecycle: a replayable read
 * model of the outbound accounting-sync execution queue.
 *
 * See docs/architecture/finance/projection-runtime.md (the worker contract)
 * and docs/architecture/finance/projection-contracts.md §7 (the adapter_queue
 * read model).
 *
 * Architectural boundary — this projection reflects runtime state; it does NOT
 * own runtime execution:
 *   projection  = observable state
 *   worker      = execution
 *   event store = facts
 *
 * Scope (2B-10): consumes the three canonical adapter sync events and
 * maintains a tenant-scoped queued/running/failed/completed queue in a memory
 * ProjectionStore. It is NOT a scheduler, worker, retry engine, or provider
 * client. No DB persistence, no HTTP routes, no worker loops. The full §7 read
 * model (`in_flight`/`running` source events, `totals`, `meta`, `as_of`,
 * `external_id`, the `finance.approval.approved` draft→queued rule, and query
 * filters) is deferred to a later phase.
 */

export const ADAPTER_QUEUE_PROJECTION_NAME = 'finance.projection.adapter_queue';

const CONSUMED_EVENTS = [
  'finance.adapter.sync_queued',
  'finance.adapter.sync_succeeded',
  'finance.adapter.sync_failed',
];

/**
 * Future-ready adapter events — `finance.adapter.sync_cancelled`,
 * `finance.adapter.retry_scheduled`, `finance.adapter.dead_lettered` — are NOT
 * yet in the canonical finance taxonomy, so they are deliberately absent from
 * `CONSUMED_EVENTS`. The runner ignores any non-consumed event, so such an
 * event is accepted (never crashes or degrades the projection) but has no
 * effect until it is canonicalized and given explicit handling.
 */

// Status stamped on the queue item, derived from the event type — the
// authoritative signal of what happened (never trusted from the payload).
const EVENT_STATUS = {
  'finance.adapter.sync_queued': 'queued',
  'finance.adapter.sync_succeeded': 'succeeded',
  'finance.adapter.sync_failed': 'failed',
};

/**
 * Maps an adapter-job status to its read-model bucket. `running` has no
 * consumed source event in 2B-10 (no in-flight event is canonical yet), so the
 * `running` bucket is always empty; the mapping is kept so the bucket is ready
 * when an in-flight event is canonicalized later.
 */
const STATUS_BUCKET = {
  queued: 'queued',
  running: 'running',
  succeeded: 'completed',
  failed: 'failed',
};

/**
 * Read `payload.adapter_job` from an event, throwing a descriptive error when
 * it or its `id` is missing. A malformed adapter event throws, which the
 * runtime surfaces as a degraded projection.
 *
 * Payload-shape contract: a `finance.adapter.sync_*` emitter MUST populate
 * `payload.adapter_job` with the canonical `finance.adapter_jobs` record shape
 * — `aggregate_type` / `aggregate_id` / `operation` / `mode`, reusing the
 * Track A event-envelope vocabulary. That shape is reconciled across all three
 * Phase-1 sources: the `simulateDealWon` draft adapter-job object in
 * `financeDomainService.js`, the `finance.adapter_jobs` table (migration 172),
 * and projection-contracts.md §7. An adapter job missing those identity fields
 * surfaces them as `null` rather than degrading.
 */
function readAdapterJob(event) {
  const job = event && event.payload && event.payload.adapter_job;
  if (!job || !job.id) {
    throw new Error(
      `adapter queue projection: ${event && event.event_type} event ` +
        `${event && event.id} is missing payload.adapter_job.id`,
    );
  }
  return job;
}

/**
 * Apply one adapter sync event to the store. The store is keyed by
 * `adapter_job_id`, so there is structurally exactly one record per adapter
 * job within a tenant-scoped projection — the "one active queue item per
 * adapter_job_id per tenant" invariant holds by construction.
 *
 * Every adapter event carries the full `payload.adapter_job` snapshot, so each
 * event is self-describing: the handler is an unconditional upsert ("creates
 * or updates"). `sync_queued` after `sync_failed` is the legitimate retry
 * re-queue path. Written immutably — a fresh record is always stored.
 */
function applyAdapterEvent(event, store) {
  const job = readAdapterJob(event);
  // CONSUMED_EVENTS gates dispatch and replay, so event_type is always one of
  // the three consumed sync events here.
  const status = EVENT_STATUS[event.event_type];
  store.set(job.id, {
    adapter_job_id: job.id,
    // The runner scopes the store by the event envelope tenant_id, so the
    // envelope is the authoritative tenant boundary — a stale payload tenant
    // must never surface a foreign tenant id in this tenant's read model.
    tenant_id: event.tenant_id ?? job.tenant_id ?? null,
    provider: job.provider ?? null,
    aggregate_type: job.aggregate_type ?? null,
    aggregate_id: job.aggregate_id ?? null,
    operation: job.operation ?? null,
    mode: job.mode ?? null,
    status,
    attempts: job.attempts ?? 0,
    error_message: job.error_message ?? null,
    created_at: job.created_at ?? event.created_at ?? null,
    updated_at: job.updated_at ?? event.created_at ?? null,
    correlation_id: event.correlation_id ?? null,
    causation_id: event.causation_id ?? null,
  });
}

/** Project a stored record into a read-model queue item (a fresh object). */
function toQueueItem(record) {
  return {
    adapter_job_id: record.adapter_job_id,
    tenant_id: record.tenant_id,
    provider: record.provider,
    aggregate_type: record.aggregate_type,
    aggregate_id: record.aggregate_id,
    operation: record.operation,
    mode: record.mode,
    status: record.status,
    attempts: record.attempts,
    error_message: record.error_message,
    created_at: record.created_at,
    updated_at: record.updated_at,
    correlation_id: record.correlation_id,
    causation_id: record.causation_id,
  };
}

/**
 * Stable ascending comparator: `updated_at`, then `adapter_job_id` tie-break.
 * Buckets are ordered by the time of the latest status transition (the event
 * that last touched the job) rather than original job creation time — so the
 * `failed` / `completed` buckets read in the order jobs actually transitioned.
 * `updated_at` is immutable event-derived data, so the ordering is
 * replay-deterministic.
 */
function byUpdatedThenId(a, b) {
  if (a.updated_at < b.updated_at) return -1;
  if (a.updated_at > b.updated_at) return 1;
  if (a.adapter_job_id < b.adapter_job_id) return -1;
  if (a.adapter_job_id > b.adapter_job_id) return 1;
  return 0;
}

/**
 * Create the adapter-queue ProjectionWorker. Conforms to the Projection
 * Runtime worker contract: `handleEvent` / `replay` receive their tenant-scoped
 * store from the runner; `getProjection` assembles the read model from that
 * same store (passed as its third argument, consistent with the other two
 * methods).
 */
export function createAdapterQueueProjectionWorker() {
  return {
    projectionName: ADAPTER_QUEUE_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,

    handleEvent(event, store) {
      applyAdapterEvent(event, store);
    },

    replay(events, store) {
      for (const event of events) {
        applyAdapterEvent(event, store);
      }
    },

    getProjection(_tenantId, _opts, store) {
      const buckets = { queued: [], running: [], failed: [], completed: [] };
      for (const key of store.keys()) {
        const record = store.get(key);
        const bucket = STATUS_BUCKET[record.status];
        if (bucket) buckets[bucket].push(toQueueItem(record));
      }
      for (const name of Object.keys(buckets)) {
        buckets[name].sort(byUpdatedThenId);
      }
      return buckets;
    },
  };
}

export default createAdapterQueueProjectionWorker;
