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
 * Scope (2B-10, Phase 4-1): consumes the three canonical adapter sync events
 * plus `finance.approval.requested` (for its optional draft adapter_job
 * snapshot) and maintains a tenant-scoped draft/queued/running/failed/completed
 * queue in a memory ProjectionStore. It is NOT a scheduler, worker, retry
 * engine, or provider
 * client. No DB persistence, no HTTP routes, no worker loops. The full §7 read
 * model (`in_flight`/`running` source events, `totals`, `meta`, `as_of`,
 * `external_id`, the `finance.approval.approved` draft→queued rule, and query
 * filters) is deferred to a later phase.
 */

export const ADAPTER_QUEUE_PROJECTION_NAME = 'finance.projection.adapter_queue';

const CONSUMED_EVENTS = [
  // `finance.approval.requested` carries a `draft` adapter_job snapshot (see
  // `simulateDealWon` in financeDomainService.js). Consuming it materializes the
  // draft into the queue BEFORE any sync event exists, so persistent-mode
  // /adapter-jobs and the runtime adapter_jobs count match the in-memory domain
  // service. A later `finance.adapter.sync_queued` for the SAME adapter_job_id
  // overwrites the keyed record (draft → queued); getProjection re-buckets by
  // current status, so the job moves out of `draft` and into `queued` with no
  // duplicate.
  'finance.approval.requested',
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
// authoritative signal of what happened (never trusted from the snapshot).
const EVENT_STATUS = {
  'finance.adapter.sync_queued': 'queued',
  'finance.adapter.sync_succeeded': 'succeeded',
  'finance.adapter.sync_failed': 'failed',
};

// Resolve the queue-item status for an event. For most events the status is the
// pure event-type mapping above. The one refinement is `sync_failed`: a TRANSIENT
// (retryable) failure does NOT terminate the job — the processor writes the row
// back to `status: 'queued'` with a `next_attempt_at` and emits NO follow-up
// `sync_queued` (adapterJobProcessor.js). The event itself carries the
// authoritative classification in `payload.permanent`, so projecting every
// sync_failed as terminal `failed` would hide still-retryable jobs from
// `/adapter-jobs?status=queued`. Only a PERMANENT failure is terminal; a transient
// one is projected back to `queued`. (Absent flag ⇒ terminal — the conservative,
// back-compatible default for any pre-flag/synthetic event.)
function statusForEvent(event) {
  if (event.event_type === 'finance.adapter.sync_failed') {
    return event.payload && event.payload.permanent === false ? 'queued' : 'failed';
  }
  return EVENT_STATUS[event.event_type];
}

/**
 * Maps an adapter-job status to its read-model bucket. `running` has no
 * consumed source event in 2B-10 (no in-flight event is canonical yet), so the
 * `running` bucket is always empty; the mapping is kept so the bucket is ready
 * when an in-flight event is canonicalized later.
 */
const STATUS_BUCKET = {
  draft: 'draft',
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
 * Upsert one adapter-job snapshot into the store under `status`. The store is
 * keyed by `adapter_job_id`, so there is structurally exactly one record per
 * adapter job within a tenant-scoped projection — the "one active queue item
 * per adapter_job_id per tenant" invariant holds by construction.
 *
 * Written immutably — a fresh record is always stored — so this is idempotent
 * under double-apply (set-by-id with an event-derived status): re-applying the
 * same event yields an identical record.
 */
function upsertAdapterJob(event, job, status, store) {
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
    // Transient sync_failed re-queues the job with a backoff; carry the
    // authoritative `payload.next_attempt_at` so the read model (and
    // `/adapter-jobs`) shows when a queued retry will next run.
    next_attempt_at:
      (event.payload && event.payload.next_attempt_at) ?? job.next_attempt_at ?? null,
    // For a real `sync_failed`, the provider error is at `payload.error.message`
    // (buildSyncFailedEvent); the adapter_job snapshot is just `{ ...job, status }`
    // and does NOT carry it. Prefer the payload error so `/adapter-jobs` surfaces
    // the actual failure instead of null; fall back to the snapshot field.
    error_message:
      (event.payload && event.payload.error && event.payload.error.message) ??
      job.error_message ??
      null,
    created_at: job.created_at ?? event.created_at ?? null,
    updated_at: job.updated_at ?? event.created_at ?? null,
    correlation_id: event.correlation_id ?? null,
    causation_id: event.causation_id ?? null,
  });
}

/**
 * Apply one consumed event to the store.
 *
 * `finance.approval.requested` carries an OPTIONAL `payload.adapter_job` (the
 * `simulateDealWon` draft job). It is NOT an adapter event — historical and
 * non-adapter approval.requested events legitimately have no adapter_job — so
 * the missing case is SKIPPED, never thrown. When present, the draft is upsert
 * with status `'draft'`. A later `finance.adapter.sync_queued` for the SAME id
 * overwrites this record (draft → queued); getProjection re-buckets by current
 * status, so the job moves cleanly out of `draft` into `queued`.
 *
 * For the three adapter sync events, every event carries the full
 * `payload.adapter_job` snapshot (self-describing), and a missing snapshot is a
 * malformed adapter event — `readAdapterJob` throws, which the runtime surfaces
 * as a degraded projection. The status is derived from the event type via
 * `statusForEvent` (never from the snapshot's `status` field), with one
 * refinement: a TRANSIENT `sync_failed` (`payload.permanent === false`) projects
 * back to `queued`, because the processor re-queues retryable jobs and emits no
 * follow-up `sync_queued`. A `sync_queued` after a permanent `sync_failed`
 * remains the legitimate retry re-queue path.
 */
function applyAdapterEvent(event, store) {
  if (event.event_type === 'finance.approval.requested') {
    const job = event && event.payload && event.payload.adapter_job;
    // GUARD — approval.requested without an adapter_job (historical / non-draft
    // approvals) is a no-op, not a degraded projection.
    if (!job || !job.id) return;
    upsertAdapterJob(event, job, 'draft', store);
    return;
  }
  // CONSUMED_EVENTS gates dispatch and replay, so event_type is one of the
  // three consumed sync events here.
  const job = readAdapterJob(event);
  upsertAdapterJob(event, job, statusForEvent(event), store);
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
    next_attempt_at: record.next_attempt_at ?? null,
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
      const buckets = { draft: [], queued: [], running: [], failed: [], completed: [] };
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
