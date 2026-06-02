import test from 'node:test';
import assert from 'node:assert/strict';

import {
  checkConvergence,
  checkReplayOrdering,
  checkPerProjectionParity,
  checkRepeatedReplayDeterminism,
  checkInfrastructureEventFiltering,
  checkDegradedRecovery,
  checkTenantIsolation,
  runReplayValidation,
  compareEventOrder,
  createDefaultHarnessConfig,
} from '../../../../lib/finance/projections/replayValidationHarness.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import { createLedgerProjectionWorker } from '../../../../lib/finance/projections/ledgerProjection.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Event fixtures — realistic finance.* envelopes ────────────────────────────
//
// The harness's default config consumes the three real projection workers, so
// the fixtures must carry the real payload shapes each worker expects.

/** A balanced double-entry finance.journal.posted event (ledger projection). */
function journalPosted(id, amount, { tenant = TENANT_A, createdAt } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: 'finance.journal.posted',
    created_at: createdAt || '2026-05-21T00:00:00.000Z',
    aggregate_type: 'journal_entry',
    aggregate_id: `je-${id}`,
    payload: {
      journal_entry: {
        id: `je-${id}`,
        lines: [
          {
            account_id: null,
            account_name: 'Cash',
            classification: 'Asset',
            debit_cents: amount,
            credit_cents: 0,
          },
          {
            account_id: null,
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: amount,
          },
        ],
      },
    },
  };
}

/** A finance.approval.requested event (approval_queue projection). */
function approvalRequested(id, { tenant = TENANT_A, createdAt, approvalId } = {}) {
  const aId = approvalId || `approval_${id}`;
  return {
    id,
    tenant_id: tenant,
    event_type: 'finance.approval.requested',
    created_at: createdAt || '2026-05-21T00:00:00.000Z',
    aggregate_type: 'approval',
    aggregate_id: aId,
    actor_id: 'user_requester',
    payload: {
      approval: {
        id: aId,
        tenant_id: tenant,
        target_type: 'journal_entry',
        target_id: `je-${id}`,
        status: 'pending',
        requested_by: 'user_requester',
        requested_at: createdAt,
        created_at: createdAt,
        approval_policy: 'finance.high_value.approval_required',
        escalation_target: 'finance_controller',
        risk_level: 'high',
      },
    },
  };
}

/** A finance.approval.{approved,rejected,cancelled} event. */
function approvalResolved(eventType, id, { tenant = TENANT_A, createdAt, approvalId } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: eventType,
    created_at: createdAt || '2026-05-21T01:00:00.000Z',
    aggregate_type: 'approval',
    aggregate_id: approvalId || `approval_${id}`,
    actor_id: 'user_approver',
    payload: { approval: { id: approvalId || `approval_${id}` } },
  };
}

/** A finance.adapter.sync_* event (adapter_queue projection). */
function adapterEvent(eventType, id, { tenant = TENANT_A, createdAt, adapterJobId } = {}) {
  const jobId = adapterJobId || `adapter_job_${id}`;
  return {
    id,
    tenant_id: tenant,
    event_type: eventType,
    created_at: createdAt || '2026-05-21T00:00:00.000Z',
    aggregate_type: 'adapter_job',
    aggregate_id: jobId,
    correlation_id: `corr-${id}`,
    causation_id: `cause-${id}`,
    payload: {
      adapter_job: {
        id: jobId,
        tenant_id: tenant,
        provider: 'quickbooks',
        aggregate_type: 'journal_entry',
        aggregate_id: `je-${id}`,
        operation: 'push_draft',
        mode: 'draft_only',
        attempts: 0,
        error_message: null,
        created_at: createdAt,
        updated_at: createdAt,
      },
    },
  };
}

/** A reserved finance.audit.event_appended infrastructure event. */
function auditEventAppended(id, { tenant = TENANT_A, createdAt } = {}) {
  return {
    id,
    tenant_id: tenant,
    event_type: 'finance.audit.event_appended',
    created_at: createdAt || '2026-05-21T00:00:00.000Z',
    aggregate_type: 'audit_event',
    aggregate_id: `evt-${id}`,
    payload: { event_appended: { id: `evt-${id}` } },
  };
}

/**
 * A well-formed, multi-projection event stream for one tenant. Exercises the
 * ledger (journals), approval_queue (request/approve/reject/cancel), and
 * adapter_queue (sync queued/succeeded/failed) projections, with one
 * created_at collision to exercise the id tie-break.
 */
function healthyStream(tenant = TENANT_A) {
  return [
    journalPosted('e01', 100000, { tenant, createdAt: '2026-05-21T01:00:00.000Z' }),
    approvalRequested('e02', { tenant, createdAt: '2026-05-21T02:00:00.000Z' }),
    adapterEvent('finance.adapter.sync_queued', 'e03', {
      tenant,
      createdAt: '2026-05-21T03:00:00.000Z',
    }),
    journalPosted('e04', 25000, { tenant, createdAt: '2026-05-21T04:00:00.000Z' }),
    approvalResolved('finance.approval.approved', 'e05', {
      tenant,
      createdAt: '2026-05-21T05:00:00.000Z',
      approvalId: 'approval_e02',
    }),
    // Two events sharing a created_at millisecond — id tie-break path.
    adapterEvent('finance.adapter.sync_succeeded', 'e06', {
      tenant,
      createdAt: '2026-05-21T06:00:00.000Z',
      adapterJobId: 'adapter_job_e03',
    }),
    approvalRequested('e07', { tenant, createdAt: '2026-05-21T06:00:00.000Z' }),
    approvalResolved('finance.approval.rejected', 'e08', {
      tenant,
      createdAt: '2026-05-21T07:00:00.000Z',
      approvalId: 'approval_e07',
    }),
    adapterEvent('finance.adapter.sync_queued', 'e09', {
      tenant,
      createdAt: '2026-05-21T08:00:00.000Z',
      adapterJobId: 'adapter_job_e09',
    }),
    adapterEvent('finance.adapter.sync_failed', 'e10', {
      tenant,
      createdAt: '2026-05-21T09:00:00.000Z',
      adapterJobId: 'adapter_job_e09',
    }),
    approvalRequested('e11', { tenant, createdAt: '2026-05-21T10:00:00.000Z' }),
    approvalResolved('finance.approval.cancelled', 'e12', {
      tenant,
      createdAt: '2026-05-21T11:00:00.000Z',
      approvalId: 'approval_e11',
    }),
  ];
}

// ── compareEventOrder ─────────────────────────────────────────────────────────

test('compareEventOrder sorts by created_at ASC then id ASC', () => {
  const a = { id: 'b', created_at: '2026-05-21T01:00:00.000Z' };
  const b = { id: 'a', created_at: '2026-05-21T02:00:00.000Z' };
  const tie1 = { id: 'aaa', created_at: '2026-05-21T05:00:00.000Z' };
  const tie2 = { id: 'bbb', created_at: '2026-05-21T05:00:00.000Z' };

  assert.equal(compareEventOrder(a, b), -1, 'earlier created_at sorts first');
  assert.equal(compareEventOrder(b, a), 1);
  assert.equal(compareEventOrder(tie1, tie2), -1, 'same created_at -> id tie-break');
  assert.equal(compareEventOrder(tie1, tie1), 0);
});

// ── Convergence ───────────────────────────────────────────────────────────────

test('checkConvergence passes — dispatch and replay build identical stores', async () => {
  const res = await checkConvergence(healthyStream(), TENANT_A);

  assert.equal(res.name, 'convergence');
  assert.equal(res.passed, true);
  assert.equal(res.detail.event_count, 12);
  assert.equal(res.detail.diverged.length, 0);
  // All three real projections converged.
  assert.deepEqual(res.detail.projections.map((p) => p.projection).sort(), [
    'finance.projection.adapter_queue',
    'finance.projection.approval_queue',
    'finance.projection.journal_entries',
    'finance.projection.ledger',
  ]);
  assert.ok(res.detail.projections.every((p) => p.converged));
});

test('checkConvergence detects a divergent (tampered) stream — passed:false', async () => {
  // Tamper: the dispatch and replay paths would build identical stores from the
  // same input. To force divergence we inject a worker whose handleEvent and
  // replay disagree — incremental dispatch produces a different store than a
  // full replay, exactly the class of bug the harness must catch.
  const divergentConfig = {
    createWorkers: () => [
      {
        projectionName: 'finance.projection.ledger',
        consumedEvents: ['finance.journal.posted'],
        schemaVersion: 1,
        // Incremental path appends the event id.
        handleEvent(event, store) {
          store.set('ids', [...(store.get('ids') || []), event.id]);
        },
        // Replay path appends a CONSTANT — guaranteed to diverge from dispatch.
        replay(events, store) {
          for (const _e of events) {
            store.set('ids', [...(store.get('ids') || []), 'TAMPERED']);
          }
        },
        getProjection() {
          return {};
        },
      },
    ],
  };

  const res = await checkConvergence(healthyStream(), TENANT_A, divergentConfig);

  assert.equal(res.passed, false, 'a divergent stream must fail convergence');
  assert.equal(res.detail.diverged.length, 1);
  assert.equal(res.detail.diverged[0].projection, 'finance.projection.ledger');
  assert.notDeepEqual(res.detail.diverged[0].dispatched, res.detail.diverged[0].replayed);
});

// ── Replay ordering ───────────────────────────────────────────────────────────

test('checkReplayOrdering passes — events come back in created_at ASC, id ASC', async () => {
  // Feed the stream in scrambled order; the event store must re-order it.
  const scrambled = [...healthyStream()].reverse();
  const res = await checkReplayOrdering(scrambled, TENANT_A);

  assert.equal(res.name, 'replay_ordering');
  assert.equal(res.passed, true);
  assert.equal(res.detail.tie_break_exercised, true, 'the id tie-break path is covered');
  // The actual order must be the canonical created_at/id order.
  const expected = [...healthyStream()].sort(compareEventOrder).map((e) => e.id);
  assert.deepEqual(res.detail.actual_order, expected);
});

test('checkReplayOrdering resolves a created_at tie deterministically by id ASC', async () => {
  // Three events sharing one millisecond — fed id-descending.
  const events = [
    journalPosted('zzz', 100, { createdAt: '2026-05-21T05:00:00.000Z' }),
    journalPosted('mmm', 100, { createdAt: '2026-05-21T05:00:00.000Z' }),
    journalPosted('aaa', 100, { createdAt: '2026-05-21T05:00:00.000Z' }),
  ];
  const res = await checkReplayOrdering(events, TENANT_A);

  assert.equal(res.passed, true);
  assert.deepEqual(res.detail.actual_order, ['aaa', 'mmm', 'zzz']);
});

// ── Per-projection parity ─────────────────────────────────────────────────────

test('checkPerProjectionParity passes for ledger, approval_queue, adapter_queue, journal_entries', async () => {
  const res = await checkPerProjectionParity(healthyStream(), TENANT_A);

  assert.equal(res.name, 'per_projection_parity');
  assert.equal(res.passed, true);
  assert.equal(res.detail.projections.length, 4);
  assert.ok(res.detail.projections.every((p) => p.converged));
});

// ── Repeated-replay determinism ───────────────────────────────────────────────

test('checkRepeatedReplayDeterminism passes — replaying twice yields identical state', async () => {
  const res = await checkRepeatedReplayDeterminism(healthyStream(), TENANT_A);

  assert.equal(res.name, 'repeated_replay_determinism');
  assert.equal(res.passed, true);
  assert.equal(res.detail.projections.length, 4);
  assert.ok(res.detail.projections.every((p) => p.stable));
});

test('checkRepeatedReplayDeterminism detects a non-deterministic replay — passed:false', async () => {
  // A worker whose replay() depends on hidden mutable state (a closure counter)
  // rather than purely on the event stream — so a second replay diverges from
  // the first. This is exactly the non-reproducible-rebuild bug the check guards.
  let replayRuns = 0;
  const nonDeterministicConfig = {
    createWorkers: () => [
      {
        projectionName: 'finance.projection.ledger',
        consumedEvents: ['finance.journal.posted'],
        schemaVersion: 1,
        handleEvent() {},
        replay(_events, store) {
          replayRuns += 1;
          store.set('run', replayRuns);
        },
        getProjection() {
          return {};
        },
      },
    ],
  };

  const res = await checkRepeatedReplayDeterminism(
    healthyStream(),
    TENANT_A,
    nonDeterministicConfig,
  );

  assert.equal(res.passed, false, 'a replay that is not a pure function of the stream must fail');
  assert.ok(res.detail.projections.some((p) => !p.stable));
});

// ── Infrastructure-event filtering ────────────────────────────────────────────

test('checkInfrastructureEventFiltering passes — infra events never reach business projections', async () => {
  // Interleave finance.audit.event_appended infrastructure events into the
  // business stream — including one AFTER the last business event. Business
  // projections must rebuild identically with or without them, and no cursor
  // may advance past a business event onto an infrastructure event.
  const stream = [
    ...healthyStream(),
    auditEventAppended('i01', { createdAt: '2026-05-21T01:30:00.000Z' }),
    auditEventAppended('i02', { createdAt: '2026-05-21T23:00:00.000Z' }),
  ];

  const res = await checkInfrastructureEventFiltering(stream, TENANT_A);

  assert.equal(res.name, 'infrastructure_event_filtering');
  assert.equal(res.passed, true);
  assert.equal(res.detail.coverage_exercised, true, 'the stream actually contained infra events');
  assert.equal(res.detail.infrastructure_event_count, 2);
  assert.equal(res.detail.projections.length, 4);
  assert.ok(res.detail.projections.every((p) => p.state_identical && p.cursor_identical));
});

// ── Degraded recovery ─────────────────────────────────────────────────────────

test('checkDegradedRecovery — fault degrades, dispatch pauses, replay recovers', async () => {
  const stream = healthyStream();
  // Fault the second journal so a later journal (a consumed event) follows it.
  const res = await checkDegradedRecovery({
    events: stream,
    tenantId: TENANT_A,
    failEventId: 'e01', // first finance.journal.posted
    projectionName: 'finance.projection.ledger',
  });

  assert.equal(res.name, 'degraded_recovery');
  assert.equal(res.passed, true);
  assert.equal(res.detail.degraded_after_fault, true);
  assert.equal(res.detail.later_dispatch_paused, true);
  assert.equal(res.detail.cursor_frozen_while_degraded, true);
  assert.equal(res.detail.recovered_to_idle_after_replay, true);
  assert.equal(res.detail.recovered_state_matches_reference, true);
});

test('checkDegradedRecovery faults the adapter_queue projection and recovers', async () => {
  const res = await checkDegradedRecovery({
    events: healthyStream(),
    tenantId: TENANT_A,
    failEventId: 'e03', // first finance.adapter.sync_queued
    projectionName: 'finance.projection.adapter_queue',
  });

  assert.equal(res.passed, true);
  assert.equal(res.detail.projection, 'finance.projection.adapter_queue');
});

// ── Tenant isolation ──────────────────────────────────────────────────────────

test('checkTenantIsolation passes — interleaved tenants stay isolated', async () => {
  // Interleave two tenants' streams into one event log.
  const a = healthyStream(TENANT_A);
  const b = healthyStream(TENANT_B).map((e) => ({ ...e, id: `B-${e.id}` }));
  const interleaved = [];
  for (let i = 0; i < a.length; i++) {
    interleaved.push(a[i], b[i]);
  }

  const res = await checkTenantIsolation({
    events: interleaved,
    tenantA: TENANT_A,
    tenantB: TENANT_B,
  });

  assert.equal(res.name, 'tenant_isolation');
  assert.equal(res.passed, true);
  assert.equal(res.detail.leaks.length, 0);
  assert.equal(res.detail.cursor_issues.length, 0);
});

test('checkTenantIsolation detects a leaked cross-tenant row — passed:false', async () => {
  // A worker that ignores the runner's tenant scoping and writes a foreign
  // tenant_id into the store — the exact bug the isolation check must catch.
  const leakyConfig = {
    createWorkers: () => [
      {
        projectionName: 'finance.projection.ledger',
        consumedEvents: ['finance.journal.posted'],
        schemaVersion: 1,
        handleEvent(event, store) {
          // BUG: stamps the payload tenant id, not the envelope's — and the
          // fixture below deliberately puts a foreign tenant in the payload.
          store.set(event.id, { tenant_id: event.payload.journal_entry.lines[0].leak });
        },
        replay(events, store) {
          for (const e of events) {
            store.set(e.id, { tenant_id: e.payload.journal_entry.lines[0].leak });
          }
        },
        getProjection() {
          return {};
        },
      },
    ],
  };

  // Tenant A's event whose payload smuggles tenant B's id.
  const leakEvent = journalPosted('leak1', 100, {
    tenant: TENANT_A,
    createdAt: '2026-05-21T01:00:00.000Z',
  });
  leakEvent.payload.journal_entry.lines[0].leak = TENANT_B;
  const bEvent = journalPosted('B-1', 100, {
    tenant: TENANT_B,
    createdAt: '2026-05-21T02:00:00.000Z',
  });
  bEvent.payload.journal_entry.lines[0].leak = TENANT_B;

  const res = await checkTenantIsolation({
    events: [leakEvent, bEvent],
    tenantA: TENANT_A,
    tenantB: TENANT_B,
    config: leakyConfig,
  });

  assert.equal(res.passed, false, 'a cross-tenant leak must fail isolation');
  assert.ok(res.detail.leaks.length >= 1);
  assert.equal(res.detail.leaks[0].tenant_id, TENANT_A);
});

/**
 * A deliberately broken store provider that is NOT tenant-partitioned: it
 * ignores the tenantId argument, so every tenant shares one store per
 * projection. Models a real isolation bug — and one the `tenant_id`-field leak
 * scan cannot see when the projection's values carry no tenant id.
 */
function createNonPartitionedStoreProvider() {
  const real = createMemoryProjectionStoreProvider();
  const SHARED = 'shared-non-partitioned';
  return {
    getLiveStore: (name) => real.getLiveStore(name, SHARED),
    createShadowStore: (name) => real.createShadowStore(name, SHARED),
    promoteShadow: (name) => real.promoteShadow(name, SHARED),
    discardShadow: (name) => real.discardShadow(name, SHARED),
    getState: (name) => real.getState(name, SHARED),
    setState: (name, _tenantId, state) => real.setState(name, SHARED, state),
  };
}

test('checkTenantIsolation structural check catches a tenant_id-less leak', async () => {
  // The tenant_id leak scan only sees contamination stamped into a value's
  // tenant_id field. Ledger account buckets carry NO tenant_id — so a
  // non-tenant-partitioned store (a real isolation bug) merges one tenant's
  // ledger into another's, invisibly to that scan. The structural check
  // (full-stream rebuild vs tenant-only rebuild) must still catch it.
  const nonPartitionedConfig = {
    createStoreProvider: () => createNonPartitionedStoreProvider(),
    createWorkers: () => [createLedgerProjectionWorker()],
  };

  const events = [
    journalPosted('e01', 100000, { tenant: TENANT_A, createdAt: '2026-05-21T01:00:00.000Z' }),
    journalPosted('e02', 999, { tenant: TENANT_B, createdAt: '2026-05-21T02:00:00.000Z' }),
  ];

  const res = await checkTenantIsolation({
    events,
    tenantA: TENANT_A,
    tenantB: TENANT_B,
    config: nonPartitionedConfig,
  });

  assert.equal(res.passed, false, 'a non-partitioned ledger must fail isolation');
  assert.equal(
    res.detail.leaks.length,
    0,
    'the tenant_id field scan is structurally blind to this — it reports no leaks',
  );
  assert.ok(
    res.detail.contamination.length >= 1,
    'the structural check is what catches the value-shape-agnostic leak',
  );
  assert.equal(res.detail.contamination[0].projection, 'finance.projection.ledger');
});

// ── Aggregate suite ───────────────────────────────────────────────────────────

test('runReplayValidation passes the full suite for a healthy two-tenant stream', async () => {
  const a = healthyStream(TENANT_A);
  const b = healthyStream(TENANT_B).map((e) => ({ ...e, id: `B-${e.id}` }));
  // Interleave infrastructure events so the infrastructure-filtering check is
  // genuinely exercised (coverage_exercised: true), not a vacuous pass.
  const events = [
    ...a,
    ...b,
    auditEventAppended('i-a', { tenant: TENANT_A, createdAt: '2026-05-21T01:30:00.000Z' }),
    auditEventAppended('i-b', { tenant: TENANT_B, createdAt: '2026-05-21T01:30:00.000Z' }),
  ];

  const report = await runReplayValidation({
    events,
    tenantA: TENANT_A,
    tenantB: TENANT_B,
  });

  assert.equal(report.passed, true);
  // convergence, ordering, parity, repeated replay, infra filtering, degraded
  // recovery, tenant isolation.
  assert.equal(report.checks.length, 7);
  assert.deepEqual(report.checks.map((c) => c.name).sort(), [
    'convergence',
    'degraded_recovery',
    'infrastructure_event_filtering',
    'per_projection_parity',
    'repeated_replay_determinism',
    'replay_ordering',
    'tenant_isolation',
  ]);
  assert.ok(report.checks.every((c) => c.passed));
});

test('runReplayValidation skips tenant isolation when only one tenant is given', async () => {
  const report = await runReplayValidation({
    events: healthyStream(TENANT_A),
    tenantA: TENANT_A,
  });

  assert.equal(report.passed, true);
  assert.equal(report.checks.length, 6, 'no tenant_isolation check without tenantB');
  assert.ok(!report.checks.some((c) => c.name === 'tenant_isolation'));
});

test('runReplayValidation reports passed:false when any check fails', async () => {
  // Inject a worker whose handleEvent/replay disagree -> convergence fails ->
  // the aggregate report is failed.
  const divergentConfig = {
    createWorkers: () => [
      {
        projectionName: 'finance.projection.ledger',
        consumedEvents: ['finance.journal.posted'],
        schemaVersion: 1,
        handleEvent(event, store) {
          store.set('ids', [...(store.get('ids') || []), event.id]);
        },
        replay(events, store) {
          for (const _e of events) {
            store.set('ids', [...(store.get('ids') || []), 'TAMPERED']);
          }
        },
        getProjection() {
          return {};
        },
      },
    ],
  };

  const report = await runReplayValidation({
    events: healthyStream(TENANT_A),
    tenantA: TENANT_A,
    config: divergentConfig,
  });

  assert.equal(report.passed, false);
  const convergence = report.checks.find((c) => c.name === 'convergence');
  assert.equal(convergence.passed, false);
});

test('runReplayValidation rejects malformed input', async () => {
  await assert.rejects(
    () => runReplayValidation({ events: 'not-an-array', tenantA: TENANT_A }),
    TypeError,
  );
  await assert.rejects(() => runReplayValidation({ events: [], tenantA: undefined }), TypeError);
});

// ── Default config wiring ─────────────────────────────────────────────────────

test('createDefaultHarnessConfig wires the three real projection workers', () => {
  const cfg = createDefaultHarnessConfig();
  const workers = cfg.createWorkers();

  assert.deepEqual(workers.map((w) => w.projectionName).sort(), [
    'finance.projection.adapter_queue',
    'finance.projection.approval_queue',
    'finance.projection.journal_entries',
    'finance.projection.ledger',
  ]);
  // Each factory call yields fresh, independent instances.
  assert.notEqual(cfg.createEventStore(), cfg.createEventStore());
  assert.notEqual(cfg.createStoreProvider(), cfg.createStoreProvider());
});
