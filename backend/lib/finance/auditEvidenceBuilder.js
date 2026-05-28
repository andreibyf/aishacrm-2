/**
 * auditEvidenceBuilder.js
 *
 * Phase 2B-11 — Audit / evidence builder runtime for Finance Ops.
 *
 * A read-only, side-effect-free library that reconstructs auditor-grade
 * evidence packs purely from the finance event stream. See
 * docs/architecture/finance/audit-evidence-layer.md — this module implements
 * §6 (Evidence Pack shape) and §7 (the auditor query interface:
 * `queryAuditTimeline`, `buildEvidencePack`, `getReversalChain`).
 *
 * Hard boundaries:
 *   - No provider writes, no OAuth/provider clients, no network calls.
 *   - No mutation of any source record — every event is treated as frozen.
 *   - Tenant-scoped only — a mixed-tenant event array never leaks cross-tenant
 *     data into a pack.
 *   - Frozen Track A contract: event envelopes use `aggregate_type` /
 *     `aggregate_id`; approval records use `target_type` / `target_id`. This
 *     module never introduces `object_type` / `object_id`.
 *   - Canonical `finance.*` event names only. A command name (e.g.
 *     `PostJournalEntryCommand`) is NEVER treated as an `event_type`.
 *
 * Determinism: `pack_id` and `generated_at` are injectable so the same event
 * stream produces a byte-identical pack. The `pack_hash` is computed over the
 * pack with `integrity.pack_hash` excluded; with injected pack id / timestamp
 * the entire pack — and all three integrity hashes — are deterministic.
 */

import { randomUUID, createHash } from 'node:crypto';

/**
 * Reserved infrastructure event. It is an event-store integrity signal, not a
 * business domain event (see audit-evidence-layer.md §1.2). It is excluded from
 * normal business evidence unless `includeInfrastructureEvents` is set.
 */
export const RESERVED_INFRASTRUCTURE_EVENT = 'finance.audit.event_appended';

/**
 * The canonical finance event-type prefix. Only event_type strings that begin
 * with this prefix are accepted as business events. A command name such as
 * `PostJournalEntryCommand` does not start with `finance.` and is therefore
 * never silently consumed as a business event.
 */
const CANONICAL_EVENT_PREFIX = 'finance.';

/**
 * SHA-256 hex digest of a JSON-stable serialization of `value`.
 * `JSON.stringify(value)` (no whitespace) is the stable form referenced by
 * audit-evidence-layer.md §6.3.
 */
function sha256(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

/**
 * True when `eventType` is a canonical `finance.*` business event name.
 * A non-string, or a command-style name, returns false.
 */
export function isCanonicalFinanceEvent(eventType) {
  return typeof eventType === 'string' && eventType.startsWith(CANONICAL_EVENT_PREFIX);
}

/**
 * Normalize the `events` argument: accept EITHER an array of event envelopes OR
 * a finance event store exposing `.replay(tenantId)` / `.query(...)`. The store
 * methods may be synchronous (the in-memory `financeEventStore.js`) or
 * asynchronous (the Postgres adapter `financeEventStore.pg.js`) — the result is
 * awaited either way, so this is always safe for both backends. Resolves to a
 * plain array of events for `tenantId`.
 */
async function resolveEvents(source, tenantId) {
  if (Array.isArray(source)) {
    return source;
  }
  if (source && typeof source.replay === 'function') {
    return await source.replay(tenantId);
  }
  if (source && typeof source.query === 'function') {
    return await source.query({ tenant_id: tenantId });
  }
  throw new TypeError(
    'auditEvidenceBuilder: events source must be an array of event envelopes ' +
      'or a finance event store with a .replay(tenantId) method',
  );
}

/**
 * Stable ascending comparator for audit events: `created_at` then `id`. This is
 * the canonical ordering for evidence hashing (audit-evidence-layer.md §7.1).
 */
function byCreatedThenId(a, b) {
  const ac = a.created_at ?? '';
  const bc = b.created_at ?? '';
  if (ac < bc) return -1;
  if (ac > bc) return 1;
  const ai = a.id ?? '';
  const bi = b.id ?? '';
  if (ai < bi) return -1;
  if (ai > bi) return 1;
  return 0;
}

/**
 * Deep clone a plain JSON-serializable value. Used so the pack never holds a
 * reference to (or a frozen view of) a source event — the pack is a
 * self-contained, mutation-free snapshot.
 */
function clone(value) {
  if (value === undefined || value === null) return value;
  return JSON.parse(JSON.stringify(value));
}

/**
 * Returns true when `value` falls within the inclusive [from, to] ISO range.
 * A missing bound is treated as unbounded. A missing `value` is excluded only
 * when a bound is present.
 */
function withinRange(value, from, to) {
  if (!from && !to) return true;
  if (!value) return false;
  if (from && value < from) return false;
  if (to && value > to) return false;
  return true;
}

/**
 * Apply a trailing-`*` prefix match or exact match for `event_type`, mirroring
 * the SQL `LIKE 'finance.invoice.%'` behaviour in audit-evidence-layer.md §7.1.
 */
function matchEventType(eventType, filter) {
  if (filter === undefined || filter === null) return true;
  if (typeof filter !== 'string') return false;
  if (filter.endsWith('*')) {
    return typeof eventType === 'string' && eventType.startsWith(filter.slice(0, -1));
  }
  return eventType === filter;
}

/**
 * Shallow top-level key-equality containment check for `payload_filter`
 * (audit-evidence-layer.md §7.1 — only top-level keys are supported).
 */
function matchPayloadFilter(payload, payloadFilter) {
  if (!payloadFilter) return true;
  const target = payload || {};
  for (const [key, expected] of Object.entries(payloadFilter)) {
    if (target[key] !== expected) return false;
  }
  return true;
}

/**
 * `queryAuditTimeline` — read-only timeline query over an event array or event
 * store. Returns events for one tenant matching the supplied filters, ordered
 * `created_at ASC` then `id ASC` (the canonical ordering — see §7.1).
 *
 * @param {Array|object} events  Array of event envelopes OR a finance event
 *   store with `.replay(tenantId)` (synchronous or async — both are awaited).
 * @param {object} query
 * @param {string} query.tenant_id          required — tenant isolation boundary
 * @param {string} [query.from]             inclusive ISO lower bound on created_at
 * @param {string} [query.to]               inclusive ISO upper bound on created_at
 * @param {string} [query.actor_id]
 * @param {string} [query.actor_type]       'human' | 'ai_agent' | 'system'
 * @param {string} [query.event_type]       exact, or trailing-'*' prefix match
 * @param {string} [query.target_id]        matched against aggregate_id
 * @param {string} [query.target_type]      matched against aggregate_type
 * @param {string} [query.correlation_id]
 * @param {string} [query.causation_id]
 * @param {string} [query.braid_trace_id]
 * @param {object} [query.payload_filter]   top-level payload key-equality
 * @param {number} [query.limit]            default 500, max 5000
 * @param {number} [query.offset]           default 0
 * @param {boolean} [query.includeInfrastructureEvents]  include the reserved
 *   `finance.audit.event_appended` event (default false)
 * @returns {Promise<{events: Array, total_count: number, query: object}>}
 */
export async function queryAuditTimeline(events, query = {}) {
  const {
    tenant_id: tenantId,
    from = null,
    to = null,
    actor_id: actorId,
    actor_type: actorType,
    event_type: eventType,
    target_id: targetId,
    target_type: targetType,
    correlation_id: correlationId,
    causation_id: causationId,
    braid_trace_id: braidTraceId,
    payload_filter: payloadFilter,
    limit = 500,
    offset = 0,
    includeInfrastructureEvents = false,
  } = query;

  if (!tenantId) {
    throw new TypeError('queryAuditTimeline: tenant_id is required');
  }

  const resolved = await resolveEvents(events, tenantId);

  const filtered = resolved.filter((evt) => {
    if (!evt || evt.tenant_id !== tenantId) return false;
    // Drop non-canonical event names: a command name as event_type is never a
    // business event. The reserved infrastructure event is canonical but is
    // excluded from normal business evidence unless explicitly requested.
    if (!isCanonicalFinanceEvent(evt.event_type)) return false;
    if (evt.event_type === RESERVED_INFRASTRUCTURE_EVENT && !includeInfrastructureEvents) {
      return false;
    }
    if (!withinRange(evt.created_at, from, to)) return false;
    if (actorId !== undefined && evt.actor_id !== actorId) return false;
    if (actorType !== undefined && evt.actor_type !== actorType) return false;
    if (!matchEventType(evt.event_type, eventType)) return false;
    if (targetId !== undefined && evt.aggregate_id !== targetId) return false;
    if (targetType !== undefined && evt.aggregate_type !== targetType) return false;
    if (correlationId !== undefined && evt.correlation_id !== correlationId) return false;
    if (causationId !== undefined && evt.causation_id !== causationId) return false;
    if (braidTraceId !== undefined && evt.braid_trace_id !== braidTraceId) return false;
    if (!matchPayloadFilter(evt.payload, payloadFilter)) return false;
    return true;
  });

  filtered.sort(byCreatedThenId);

  const totalCount = filtered.length;
  const cappedLimit = Math.min(Math.max(Number(limit) || 0, 0), 5000);
  const safeOffset = Math.max(Number(offset) || 0, 0);
  const page = filtered.slice(safeOffset, safeOffset + cappedLimit).map(clone);

  return {
    events: page,
    total_count: totalCount,
    query: { ...query },
  };
}

/**
 * `getReversalChain` — reconstructs the complete event chain for a journal
 * entry and all of its reversals (audit-evidence-layer.md §5.3 / §7.3).
 *
 * Reversal events are identified by `payload.original_entry_id === journalEntryId`
 * — a direct link back to the original, no join required. Not recursive: a
 * compound reversal is detected by calling `getReversalChain` again on each
 * `reversal_entry_id`.
 *
 * @param {Array|object} events       event array OR event store (sync or async)
 * @param {string} tenantId
 * @param {string} journalEntryId
 * @returns {Promise<{original_entry_id: string, original_events: Array,
 *   reversal_chains: Array<{reversal_entry_id: string, events: Array}>}>}
 */
export async function getReversalChain(events, tenantId, journalEntryId) {
  if (!tenantId) {
    throw new TypeError('getReversalChain: tenantId is required');
  }
  if (!journalEntryId) {
    throw new TypeError('getReversalChain: journalEntryId is required');
  }

  const resolved = await resolveEvents(events, tenantId);

  // 1. All events for the original entry's own aggregate timeline.
  const originalEvents = (
    await queryAuditTimeline(resolved, {
      tenant_id: tenantId,
      target_id: journalEntryId,
    })
  ).events;

  // 2. All reversal events pointing back to the original via
  //    payload.original_entry_id.
  const reversalEvents = (
    await queryAuditTimeline(resolved, {
      tenant_id: tenantId,
      payload_filter: { original_entry_id: journalEntryId },
    })
  ).events;

  // 3. The distinct reversal entry aggregate ids, in stable (sorted) order so
  //    the chain is replay-deterministic.
  const reversalEntryIds = [
    ...new Set(reversalEvents.map((e) => e.aggregate_id).filter(Boolean)),
  ].sort();

  const reversalChains = await Promise.all(
    reversalEntryIds.map(async (id) => ({
      reversal_entry_id: id,
      events: (
        await queryAuditTimeline(resolved, {
          tenant_id: tenantId,
          target_id: id,
        })
      ).events,
    })),
  );

  return {
    original_entry_id: journalEntryId,
    original_events: originalEvents,
    reversal_chains: reversalChains,
  };
}

/**
 * Extract the aggregate state snapshot from an event payload, regardless of
 * which canonical wrapper key the snapshot lives under (`invoice`,
 * `journal_entry`, `approval`, `adapter_job`, `reversal_entry`). Returns null
 * when no snapshot is present (e.g. validation_failed events).
 */
function extractStateSnapshot(payload) {
  if (!payload || typeof payload !== 'object') return null;
  for (const key of ['invoice', 'journal_entry', 'approval', 'adapter_job', 'reversal_entry']) {
    if (payload[key] && typeof payload[key] === 'object') {
      return payload[key];
    }
  }
  return null;
}

/**
 * Build the per-aggregate `state_timeline` from the events array. Events are
 * grouped by `(aggregate_type, aggregate_id)`; each group keeps its `payload`
 * snapshots in chronological order (audit-evidence-layer.md §6.2).
 */
function buildStateTimeline(sortedEvents) {
  const groups = new Map();
  for (const evt of sortedEvents) {
    if (!evt.aggregate_id) continue;
    const snapshot = extractStateSnapshot(evt.payload);
    if (snapshot === null) continue;
    const key = `${evt.aggregate_type || ''}::${evt.aggregate_id}`;
    if (!groups.has(key)) {
      groups.set(key, {
        aggregate_type: evt.aggregate_type ?? null,
        aggregate_id: evt.aggregate_id,
        snapshots: [],
      });
    }
    groups.get(key).snapshots.push({
      event_id: evt.id ?? null,
      event_type: evt.event_type,
      created_at: evt.created_at ?? null,
      state: clone(snapshot),
    });
  }
  // Deterministic ordering of timelines: by aggregate_type then aggregate_id.
  return [...groups.values()].sort((a, b) => {
    const at = `${a.aggregate_type ?? ''}::${a.aggregate_id ?? ''}`;
    const bt = `${b.aggregate_type ?? ''}::${b.aggregate_id ?? ''}`;
    if (at < bt) return -1;
    if (at > bt) return 1;
    return 0;
  });
}

/**
 * Collect the approval-record snapshots referenced by events in the pack.
 * Approval records carry the Track A approval vocabulary
 * (`target_type` / `target_id`) — never `object_type` / `object_id`. The latest
 * snapshot per approval id wins (events are processed in chronological order).
 */
function buildApprovals(sortedEvents) {
  const byId = new Map();
  for (const evt of sortedEvents) {
    const approval = evt.payload && evt.payload.approval;
    if (!approval || !approval.id) continue;
    // Later events overwrite earlier ones — the chronological last snapshot is
    // the most complete (e.g. carries approved_by / approved_at).
    byId.set(approval.id, clone(approval));
  }
  return [...byId.values()].sort((a, b) => {
    const ai = a.id ?? '';
    const bi = b.id ?? '';
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
}

/**
 * Collect adapter-job lineage from events that carry `payload.adapter_job`.
 * Returns the latest snapshot per adapter-job id. Omitted from the pack when
 * empty (no adapter activity in the queried window).
 */
function buildAdapterJobs(sortedEvents) {
  const byId = new Map();
  for (const evt of sortedEvents) {
    const job = evt.payload && evt.payload.adapter_job;
    if (!job || !job.id) continue;
    byId.set(job.id, clone(job));
  }
  return [...byId.values()].sort((a, b) => {
    const ai = a.id ?? '';
    const bi = b.id ?? '';
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });
}

/**
 * Build the deduplicated `governance_decisions` list — one entry per event that
 * carries a non-empty `policy_decision` snapshot (audit-evidence-layer.md §6.2).
 */
function buildGovernanceDecisions(sortedEvents) {
  const decisions = [];
  for (const evt of sortedEvents) {
    const decision = evt.policy_decision;
    if (!decision || typeof decision !== 'object' || Object.keys(decision).length === 0) {
      continue;
    }
    decisions.push({
      event_id: evt.id ?? null,
      event_type: evt.event_type,
      decision: clone(decision),
    });
  }
  return decisions;
}

/**
 * Build the reversal-lineage block: every event that references an
 * `original_entry_id` in its payload, grouped by original entry. Always returns
 * `{ count, entries }` — `{ count: 0, entries: [] }` when there are no
 * reversals (graceful handling of absent optional lineage).
 */
async function buildReversalLineage(events, tenantId, sortedEvents) {
  const originalIds = new Set();
  for (const evt of sortedEvents) {
    const originalId = evt.payload && evt.payload.original_entry_id;
    if (originalId) originalIds.add(originalId);
  }
  const sortedOriginalIds = [...originalIds].sort();
  const entries = await Promise.all(
    sortedOriginalIds.map((originalId) => getReversalChain(events, tenantId, originalId)),
  );
  return {
    count: sortedOriginalIds.length,
    entries,
  };
}

/**
 * Build the human-readable `summary` section (audit-evidence-layer.md §6.2).
 */
function buildSummary(sortedEvents, fromDate, toDate, reversalLineage) {
  const eventTypes = {};
  const actorMap = new Map();
  let aiTotal = 0;
  let aiBlocked = 0;
  let aiRequiredApproval = 0;

  for (const evt of sortedEvents) {
    eventTypes[evt.event_type] = (eventTypes[evt.event_type] ?? 0) + 1;

    const actorKey = `${evt.actor_id ?? 'null'}::${evt.actor_type ?? 'unknown'}`;
    if (!actorMap.has(actorKey)) {
      actorMap.set(actorKey, {
        actor_id: evt.actor_id ?? null,
        actor_type: evt.actor_type ?? null,
        event_count: 0,
      });
    }
    actorMap.get(actorKey).event_count += 1;

    if (evt.actor_type === 'ai_agent') {
      aiTotal += 1;
      const decision = evt.policy_decision || {};
      if (decision.allowed === false) aiBlocked += 1;
      if (decision.requires_approval === true) aiRequiredApproval += 1;
    }
  }

  const actors = [...actorMap.values()].sort((a, b) => {
    const ai = `${a.actor_id ?? ''}::${a.actor_type ?? ''}`;
    const bi = `${b.actor_id ?? ''}::${b.actor_type ?? ''}`;
    if (ai < bi) return -1;
    if (ai > bi) return 1;
    return 0;
  });

  return {
    period: { from: fromDate ?? null, to: toDate ?? null },
    event_types: eventTypes,
    actors,
    ai_actions: {
      total: aiTotal,
      blocked: aiBlocked,
      required_approval: aiRequiredApproval,
    },
    reversals: {
      count: reversalLineage.count,
      entries: reversalLineage.entries.map((e) => e.original_entry_id),
    },
  };
}

/**
 * `buildEvidencePack` — generate a tamper-evident evidence pack (§6) for one
 * tenant and a date range or a specific aggregate target.
 *
 * Read-only: writes nothing, mutates nothing, contacts no provider.
 *
 * When `targetId` is supplied, the pack widens to the full `correlation_id`
 * span of the earliest event for that aggregate — capturing the complete intent
 * chain (e.g. an AI-initiated draft → approval → posted), not just events whose
 * `aggregate_id` matches `targetId` (audit-evidence-layer.md §6.1 / §7.2).
 *
 * @param {Array|object} events    Array of event envelopes OR a finance event
 *   store with `.replay(tenantId)` (synchronous or async — both are awaited).
 * @param {object} options
 * @param {string} options.tenantId        required — tenant isolation boundary
 * @param {string} [options.fromDate]      inclusive ISO lower bound on created_at
 * @param {string} [options.toDate]        inclusive ISO upper bound on created_at
 * @param {string} [options.targetType]    optional aggregate_type filter
 * @param {string} [options.targetId]      optional aggregate_id; widens to its
 *   full correlation_id span
 * @param {{actor_id: string, actor_type: string}} [options.generatedBy]
 *   who requested the pack (pack metadata)
 * @param {string} [options.packId]        injectable for deterministic output;
 *   defaults to `pack_${randomUUID()}`
 * @param {string} [options.generatedAt]   injectable ISO timestamp; defaults to
 *   `new Date().toISOString()`
 * @param {() => string} [options.idFactory]  alternative pack-id source
 * @param {() => string} [options.clock]      alternative generated_at source
 * @param {boolean} [options.includeInfrastructureEvents]  include the reserved
 *   `finance.audit.event_appended` integrity event (default false)
 * @returns {Promise<object>} the evidence pack (see audit-evidence-layer.md §6.2)
 */
export async function buildEvidencePack(events, options = {}) {
  const {
    tenantId,
    fromDate = null,
    toDate = null,
    targetType,
    targetId,
    generatedBy = null,
    packId,
    generatedAt,
    idFactory,
    clock,
    includeInfrastructureEvents = false,
  } = options;

  if (!tenantId) {
    throw new TypeError('buildEvidencePack: tenantId is required');
  }

  const resolved = await resolveEvents(events, tenantId);

  // Deterministic injection points: packId / generatedAt are inherently
  // volatile, so they are injectable. With fixed values the whole pack — and
  // all integrity hashes — is byte-identical across builds of the same stream.
  const resolvedPackId =
    packId ?? (typeof idFactory === 'function' ? idFactory() : `pack_${randomUUID()}`);
  const resolvedGeneratedAt =
    generatedAt ?? (typeof clock === 'function' ? clock() : new Date().toISOString());

  // Base selection: tenant-scoped, date-ranged, optionally aggregate-typed.
  let selected = (
    await queryAuditTimeline(resolved, {
      tenant_id: tenantId,
      from: fromDate,
      to: toDate,
      target_type: targetType,
      includeInfrastructureEvents,
    })
  ).events;

  // §6.1 — when a specific targetId is supplied, widen to the full
  // correlation_id span of the earliest event for that aggregate so the entire
  // intent chain is captured even when the caller queries by the final
  // aggregate.
  if (targetId) {
    const targetEvents = (
      await queryAuditTimeline(resolved, {
        tenant_id: tenantId,
        target_id: targetId,
        includeInfrastructureEvents,
      })
    ).events;
    const correlationId = targetEvents.length > 0 ? targetEvents[0].correlation_id : undefined;
    if (correlationId) {
      selected = (
        await queryAuditTimeline(resolved, {
          tenant_id: tenantId,
          from: fromDate,
          to: toDate,
          correlation_id: correlationId,
          includeInfrastructureEvents,
        })
      ).events;
    } else {
      // No correlation_id on the target — fall back to the aggregate timeline.
      selected = targetEvents;
    }
  }

  // queryAuditTimeline already returns deep clones sorted created_at ASC, id
  // ASC — the canonical ordering for evidence hashing.
  const sortedEvents = selected;

  const approvals = buildApprovals(sortedEvents);
  const adapterJobs = buildAdapterJobs(sortedEvents);
  const stateTimeline = buildStateTimeline(sortedEvents);
  const governanceDecisions = buildGovernanceDecisions(sortedEvents);
  const reversalLineage = await buildReversalLineage(resolved, tenantId, sortedEvents);
  const summary = buildSummary(sortedEvents, fromDate, toDate, reversalLineage);

  const eventsHash = sha256(sortedEvents);
  const approvalsHash = sha256(approvals);

  // Assemble the pack WITHOUT integrity.pack_hash so it can be hashed, then
  // attach pack_hash. pack_hash covers the entire document except itself.
  const pack = {
    pack_id: resolvedPackId,
    generated_at: resolvedGeneratedAt,
    generated_by: generatedBy
      ? {
          actor_id: generatedBy.actor_id ?? null,
          actor_type: generatedBy.actor_type ?? null,
        }
      : null,
    tenant_id: tenantId,
    query: {
      from_date: fromDate,
      to_date: toDate,
      target_type: targetType ?? null,
      target_id: targetId ?? null,
    },
    event_count: sortedEvents.length,
    integrity: {
      algorithm: 'SHA-256',
      events_hash: eventsHash,
      approvals_hash: approvalsHash,
      // pack_hash filled in below
    },
    summary,
    events: sortedEvents,
    approvals,
    adapter_jobs: adapterJobs,
    state_timeline: stateTimeline,
    governance_decisions: governanceDecisions,
    reversals: reversalLineage,
  };

  // §6.3 — pack_hash is SHA-256 of the pack with integrity.pack_hash excluded.
  pack.integrity.pack_hash = sha256(pack);

  return pack;
}

export default buildEvidencePack;
