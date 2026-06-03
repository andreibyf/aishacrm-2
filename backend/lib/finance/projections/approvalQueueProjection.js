/**
 * approvalQueueProjection.js
 *
 * Phase 2B-9 — Approval Queue projection worker. The first projection that
 * tracks operational workflow state (human-in-the-loop approvals) rather than
 * accounting math.
 *
 * See docs/architecture/finance/projection-runtime.md (the worker contract)
 * and docs/architecture/finance/projection-contracts.md §6 (the approval_queue
 * read model).
 *
 * Scope (2B-9): consumes the four approval lifecycle events and maintains a
 * tenant-scoped pending/resolved queue in a memory ProjectionStore. No DB
 * persistence, no HTTP routes. The full §6 read model (totals, meta,
 * ai_initiated, age_seconds, finance.journal.reversal_requested) is deferred to
 * a later phase.
 */

export const APPROVAL_QUEUE_PROJECTION_NAME = 'finance.projection.approval_queue';

const CONSUMED_EVENTS = [
  'finance.approval.requested',
  'finance.approval.approved',
  'finance.approval.rejected',
  'finance.approval.cancelled',
];

/**
 * Maps a resolution event type to the status it stamps on the approval record.
 * `finance.approval.requested` is handled separately (it creates the record).
 */
const RESOLUTION_STATUS = {
  'finance.approval.approved': 'approved',
  'finance.approval.rejected': 'rejected',
  'finance.approval.cancelled': 'cancelled',
};

/**
 * Read `payload.approval` from an event, throwing a descriptive error when it
 * or its `id` is missing. A malformed approval event throws, which the runtime
 * surfaces as a degraded projection.
 */
function readApproval(event) {
  const approval = event && event.payload && event.payload.approval;
  if (!approval || !approval.id) {
    throw new Error(
      `approval queue projection: ${event && event.event_type} event ` +
        `${event && event.id} is missing payload.approval.id`,
    );
  }
  return approval;
}

/**
 * Apply one approval lifecycle event to the store. The store is keyed by
 * `approval_id`, so there is exactly one record per approval within a
 * tenant-scoped projection — the "no two active pending records for one
 * approval_id" invariant holds structurally.
 *
 * Written immutably — a fetched record is never mutated; a fresh record is
 * always stored.
 */
function applyApprovalEvent(event, store) {
  const approval = readApproval(event);
  const key = approval.id;

  if (event.event_type === 'finance.approval.requested') {
    // finance.approval.requested is create-only. A second requested event for
    // an approval that already has a record — pending OR resolved — is a
    // duplicate (at-least-once delivery, replay) and must be a no-op. Without
    // this guard a duplicate request would overwrite a resolved record back to
    // `pending`, reopening an already approved/rejected/cancelled approval.
    if (store.get(key)) return;
    store.set(key, {
      approval_id: approval.id,
      // The runner scopes the store by the event envelope tenant_id, so the
      // envelope is the authoritative tenant boundary — a stale payload tenant
      // must never surface a foreign tenant id in this tenant's read model.
      tenant_id: event.tenant_id ?? approval.tenant_id ?? null,
      target_type: approval.target_type ?? null,
      target_id: approval.target_id ?? null,
      risk_level: approval.risk_level ?? null,
      requested_by: approval.requested_by ?? event.actor_id ?? null,
      created_at: approval.created_at ?? approval.requested_at ?? event.created_at ?? null,
      approval_policy: approval.approval_policy ?? null,
      escalation_target: approval.escalation_target ?? null,
      status: 'pending',
      resolved_by: null,
      resolved_at: null,
    });
    return;
  }

  // A resolution event (approved / rejected / cancelled). `CONSUMED_EVENTS`
  // gates dispatch, so `event_type` is always one of the four here.
  const status = RESOLUTION_STATUS[event.event_type];
  const prev = store.get(key);
  if (!prev) {
    throw new Error(
      `approval queue projection: ${event.event_type} event ${event.id} ` +
        `references unknown approval ${key} — no prior finance.approval.requested`,
    );
  }
  store.set(key, {
    ...prev,
    status,
    resolved_by: event.actor_id ?? null,
    resolved_at: event.created_at ?? null,
  });
}

/** Project a stored record into the `pending` read-model entry. */
function toPendingEntry(record) {
  return {
    approval_id: record.approval_id,
    tenant_id: record.tenant_id,
    target_type: record.target_type,
    target_id: record.target_id,
    risk_level: record.risk_level,
    requested_by: record.requested_by,
    created_at: record.created_at,
    approval_policy: record.approval_policy,
    escalation_target: record.escalation_target,
  };
}

/**
 * Project a stored record into the `resolved` read-model entry.
 *
 * Phase 4-1 (Task 3): additively carries `requested_by` / `requested_at` so the
 * persistent-mode `/approvals?status=all` read reproduces the in-memory
 * `service.listApprovals()` shape for resolved approvals (which keep their
 * original requester + request timestamp). `requested_at` is sourced from the
 * stored record's `created_at`, which the requested-event handler set from the
 * approval's `created_at ?? requested_at` — the same value the in-memory
 * `buildApprovalRecord()` stamps on both fields.
 */
function toResolvedEntry(record) {
  return {
    approval_id: record.approval_id,
    status: record.status,
    resolved_by: record.resolved_by,
    resolved_at: record.resolved_at,
    target_type: record.target_type,
    target_id: record.target_id,
    requested_by: record.requested_by,
    requested_at: record.created_at,
  };
}

/** Stable ascending comparator: primary key, then `approval_id` as tie-break. */
function ascBy(primary) {
  return (a, b) => {
    if (a[primary] < b[primary]) return -1;
    if (a[primary] > b[primary]) return 1;
    if (a.approval_id < b.approval_id) return -1;
    if (a.approval_id > b.approval_id) return 1;
    return 0;
  };
}

/**
 * Create the approval-queue ProjectionWorker. Conforms to the Projection
 * Runtime worker contract: `handleEvent` / `replay` receive their tenant-scoped
 * store from the runner; `getProjection` assembles the read model from that
 * same store (passed as its third argument, consistent with the other two
 * methods).
 */
export function createApprovalQueueProjectionWorker() {
  return {
    projectionName: APPROVAL_QUEUE_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,

    handleEvent(event, store) {
      applyApprovalEvent(event, store);
    },

    replay(events, store) {
      for (const event of events) {
        applyApprovalEvent(event, store);
      }
    },

    getProjection(_tenantId, _opts, store) {
      const pending = [];
      const resolved = [];
      for (const key of store.keys()) {
        const record = store.get(key);
        if (record.status === 'pending') {
          pending.push(toPendingEntry(record));
        } else {
          resolved.push(toResolvedEntry(record));
        }
      }
      pending.sort(ascBy('created_at'));
      resolved.sort(ascBy('resolved_at'));
      return { pending, resolved };
    },
  };
}

export default createApprovalQueueProjectionWorker;
