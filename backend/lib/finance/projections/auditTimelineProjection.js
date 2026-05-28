/**
 * auditTimelineProjection.js
 *
 * Phase 3 / Slice 1 — Audit Timeline projection worker. The complete, ordered,
 * tamper-evident log of all finance events for a tenant, rendered as a
 * human-readable read model. Used by the Finance Audit console, compliance
 * exports, governance reviews, and debugging.
 *
 * See docs/architecture/finance/projection-runtime.md (the worker contract)
 * and docs/architecture/finance/projection-contracts.md §8 (the audit_timeline
 * read model).
 *
 * Unlike the other projections, the audit timeline may opt into the reserved
 * internal infrastructure event `finance.audit.event_appended` via the
 * `includeInfrastructureEvents` worker option — the runtime gates infra-event
 * delivery on both `consumedEvents` membership AND this opt-in flag
 * (see projectionRunner.workerConsumes).
 *
 * Scope (Slice 1): consumes the 18 finance business events (and optionally the
 * one infra event), keys the store by `event.id` so a repeated replay never
 * duplicates entries, and supports only the `order` query option. Filtering by
 * event_type / aggregate / actor / trace / time range / limit / offset and
 * `await_event_id` are deferred to a later slice.
 */

export const AUDIT_TIMELINE_PROJECTION_NAME = 'finance.projection.audit_timeline';

/**
 * The 18 finance business events (projection-contracts.md §8) plus the one
 * reserved internal infrastructure event. The infra event is gated separately
 * by `workerConsumes`: a worker only receives it when both the type is in
 * `consumedEvents` AND `worker.includeInfrastructureEvents === true`.
 */
const CONSUMED_EVENTS = [
  'finance.invoice.draft_created',
  'finance.invoice.draft_updated',
  'finance.invoice.submitted_for_approval',
  'finance.journal.draft_created',
  'finance.journal.validation_failed',
  'finance.journal.post_requested',
  'finance.journal.posted',
  'finance.journal.reversal_requested',
  'finance.journal.reversed',
  'finance.approval.requested',
  'finance.approval.approved',
  'finance.approval.rejected',
  'finance.approval.cancelled',
  'finance.adapter.sync_queued',
  'finance.adapter.sync_succeeded',
  'finance.adapter.sync_failed',
  'finance.governance.action_allowed',
  'finance.governance.action_blocked',
  'finance.audit.event_appended',
];

/**
 * Project the event's `policy_decision` into the §8 `policy_summary` shape. A
 * missing decision yields `null`; a present decision is normalised to the four
 * documented keys so the read model is stable even when upstream omits one.
 */
function summarizePolicy(policyDecision) {
  if (!policyDecision || typeof policyDecision !== 'object') return null;
  return {
    allowed: policyDecision.allowed ?? null,
    requires_approval: policyDecision.requires_approval ?? null,
    risk_level: policyDecision.risk_level ?? null,
    explanation: policyDecision.explanation ?? null,
  };
}

/**
 * Derive a one-line human-readable description per event type. Kept small and
 * synchronous — the read model must never store raw payload blobs
 * (projection-contracts.md §8). New event types should add a branch here as
 * they are introduced; the default keeps unknown / new types renderable.
 */
function summarize(event) {
  const id = event.aggregate_id ?? 'n/a';
  switch (event.event_type) {
    case 'finance.invoice.draft_created':
      return `Invoice ${id} draft created`;
    case 'finance.invoice.draft_updated':
      return `Invoice ${id} draft updated`;
    case 'finance.invoice.submitted_for_approval':
      return `Invoice ${id} submitted for approval`;
    case 'finance.journal.draft_created':
      return `Journal entry ${id} draft created`;
    case 'finance.journal.validation_failed':
      return `Journal entry ${id} validation failed`;
    case 'finance.journal.post_requested':
      return `Journal entry ${id} post requested`;
    case 'finance.journal.posted':
      return `Journal entry ${id} posted`;
    case 'finance.journal.reversal_requested':
      return `Journal entry ${id} reversal requested`;
    case 'finance.journal.reversed':
      return `Journal entry ${id} reversed`;
    case 'finance.approval.requested':
      return `Approval ${id} requested`;
    case 'finance.approval.approved':
      return `Approval ${id} approved`;
    case 'finance.approval.rejected':
      return `Approval ${id} rejected`;
    case 'finance.approval.cancelled':
      return `Approval ${id} cancelled`;
    case 'finance.adapter.sync_queued':
      return `Adapter sync ${id} queued`;
    case 'finance.adapter.sync_succeeded':
      return `Adapter sync ${id} succeeded`;
    case 'finance.adapter.sync_failed':
      return `Adapter sync ${id} failed`;
    case 'finance.governance.action_allowed':
      return `Governance action ${id} allowed`;
    case 'finance.governance.action_blocked':
      return `Governance action ${id} blocked`;
    case 'finance.audit.event_appended':
      return `Audit entry appended for ${id}`;
    default:
      return `${event.event_type} (${id})`;
  }
}

/**
 * Map an event envelope to a §8 timeline entry. Pure — derives only from the
 * envelope and `policy_decision`; never from raw payload contents (only
 * `payload_summary`, which is itself a derived one-liner).
 */
function buildEntry(event) {
  return {
    event_id: event.id,
    event_type: event.event_type,
    aggregate_type: event.aggregate_type ?? null,
    aggregate_id: event.aggregate_id ?? null,
    actor_id: event.actor_id ?? null,
    actor_type: event.actor_type ?? null,
    source: event.source ?? null,
    request_id: event.request_id ?? null,
    braid_trace_id: event.braid_trace_id ?? null,
    correlation_id: event.correlation_id ?? null,
    causation_id: event.causation_id ?? null,
    created_at: event.created_at ?? null,
    policy_summary: summarizePolicy(event.policy_decision),
    payload_summary: summarize(event),
  };
}

/**
 * Apply one event to the store. Keyed by `event.id`, so a repeated replay
 * (or a duplicate at-least-once delivery) overwrites with an identical entry —
 * never produces two entries for the same event_id.
 */
function applyEvent(event, store) {
  store.set(event.id, buildEntry(event));
}

/**
 * Stable comparator for the read model: `created_at` then `event_id`. Direction
 * is parameterised so a single sort path supports both `desc` (default) and
 * `asc` (opts.order === 'asc').
 */
function compareEntries(a, b, direction) {
  const sign = direction === 'asc' ? 1 : -1;
  if (a.created_at < b.created_at) return -1 * sign;
  if (a.created_at > b.created_at) return 1 * sign;
  if (a.event_id < b.event_id) return -1 * sign;
  if (a.event_id > b.event_id) return 1 * sign;
  return 0;
}

/**
 * Create the audit-timeline ProjectionWorker. Conforms to the Projection
 * Runtime worker contract: `handleEvent` / `replay` receive their tenant-scoped
 * store from the runner; `getProjection` assembles the §8 read model from that
 * same store.
 *
 * The `includeInfrastructureEvents` option is passed through unchanged — the
 * Runner's `workerConsumes` reads it directly to gate `finance.audit.event_appended`
 * delivery. The 18 business events are gated only by `consumedEvents` membership.
 */
export function createAuditTimelineProjectionWorker({
  includeInfrastructureEvents = false,
} = {}) {
  return {
    projectionName: AUDIT_TIMELINE_PROJECTION_NAME,
    consumedEvents: CONSUMED_EVENTS,
    schemaVersion: 1,
    includeInfrastructureEvents,

    handleEvent(event, store) {
      applyEvent(event, store);
    },

    replay(events, store) {
      for (const event of events) {
        applyEvent(event, store);
      }
    },

    getProjection(tenantId, opts = {}, store) {
      const direction = opts.order === 'asc' ? 'asc' : 'desc';
      const events = store
        .keys()
        .map((key) => store.get(key))
        .sort((a, b) => compareEntries(a, b, direction));
      return {
        tenant_id: tenantId,
        as_of: new Date().toISOString(),
        total_events: events.length,
        events,
        meta: { last_rebuilt_at: null, is_degraded: false },
      };
    },
  };
}

export default createAuditTimelineProjectionWorker;
