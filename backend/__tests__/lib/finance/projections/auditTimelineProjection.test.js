import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import {
  createAuditTimelineProjectionWorker,
  AUDIT_TIMELINE_PROJECTION_NAME,
} from '../../../../lib/finance/projections/auditTimelineProjection.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Test doubles ──────────────────────────────────────────────────────────────

/**
 * Build a business event envelope for the timeline. The envelope shape mirrors
 * what the finance event store produces — see projection-contracts.md §8.
 */
function businessEvent(id, eventType, overrides = {}) {
  return {
    id,
    tenant_id: overrides.tenant_id ?? TENANT_A,
    event_type: eventType,
    aggregate_type: overrides.aggregate_type ?? 'invoice',
    aggregate_id: overrides.aggregate_id ?? `agg-${id}`,
    actor_id: overrides.actor_id ?? 'user-001',
    actor_type: overrides.actor_type ?? 'human',
    source: overrides.source ?? 'api',
    request_id: overrides.request_id ?? `req-${id}`,
    braid_trace_id: overrides.braid_trace_id ?? null,
    correlation_id: overrides.correlation_id ?? `corr-${id}`,
    causation_id: overrides.causation_id ?? null,
    created_at: overrides.created_at ?? '2026-05-21T01:00:00.000Z',
    policy_decision: overrides.policy_decision ?? null,
    payload: overrides.payload ?? {},
  };
}

function infraEvent(id, overrides = {}) {
  return businessEvent(id, 'finance.audit.event_appended', {
    aggregate_type: 'audit_entry',
    ...overrides,
  });
}

function fakeEventStore(eventsByTenant = {}) {
  return {
    async replay(tenantId) {
      return (eventsByTenant[tenantId] || []).slice();
    },
  };
}

function makeRunner({ eventStore, storeProvider } = {}) {
  return createProjectionRunner({
    eventStore: eventStore || fakeEventStore(),
    storeProvider: storeProvider || createMemoryProjectionStoreProvider(),
    retryBackoffMs: 0,
  });
}

function timelineOf(worker, provider, tenantId, opts = {}) {
  return worker.getProjection(
    tenantId,
    opts,
    provider.getLiveStore(AUDIT_TIMELINE_PROJECTION_NAME, tenantId),
  );
}

// ── Tests ─────────────────────────────────────────────────────────────────────

test('a consumed business event is added to the timeline with the §8 entry shape', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    businessEvent('e1', 'finance.invoice.draft_created', {
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_abc123',
      actor_id: 'user-007',
      actor_type: 'human',
      source: 'web',
      request_id: 'req-e1',
      braid_trace_id: 'trace-1',
      correlation_id: 'corr-e1',
      causation_id: 'cause-e1',
      created_at: '2026-05-21T01:00:00.000Z',
      policy_decision: {
        allowed: true,
        requires_approval: false,
        risk_level: 'low',
        explanation: 'Within draft limits',
      },
    }),
  );

  const timeline = timelineOf(worker, provider, TENANT_A);
  assert.equal(timeline.tenant_id, TENANT_A);
  assert.equal(timeline.total_events, 1);
  assert.equal(timeline.events.length, 1);
  assert.ok(typeof timeline.as_of === 'string' && timeline.as_of.length > 0);
  assert.deepEqual(timeline.meta, { last_rebuilt_at: null, is_degraded: false });

  const entry = timeline.events[0];
  assert.equal(entry.event_id, 'e1');
  assert.equal(entry.event_type, 'finance.invoice.draft_created');
  assert.equal(entry.aggregate_type, 'invoice');
  assert.equal(entry.aggregate_id, 'invoice_abc123');
  assert.equal(entry.actor_id, 'user-007');
  assert.equal(entry.actor_type, 'human');
  assert.equal(entry.source, 'web');
  assert.equal(entry.request_id, 'req-e1');
  assert.equal(entry.braid_trace_id, 'trace-1');
  assert.equal(entry.correlation_id, 'corr-e1');
  assert.equal(entry.causation_id, 'cause-e1');
  assert.equal(entry.created_at, '2026-05-21T01:00:00.000Z');
  assert.deepEqual(entry.policy_summary, {
    allowed: true,
    requires_approval: false,
    risk_level: 'low',
    explanation: 'Within draft limits',
  });
  assert.ok(typeof entry.payload_summary === 'string');
  assert.ok(entry.payload_summary.length > 0);
});

test('events are ordered created_at DESC by default; opts.order: asc reverses', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    businessEvent('e1', 'finance.invoice.draft_created', {
      created_at: '2026-05-21T01:00:00.000Z',
    }),
  );
  await runner.dispatch(
    businessEvent('e2', 'finance.invoice.draft_updated', {
      created_at: '2026-05-21T02:00:00.000Z',
    }),
  );
  await runner.dispatch(
    businessEvent('e3', 'finance.invoice.submitted_for_approval', {
      created_at: '2026-05-21T03:00:00.000Z',
    }),
  );

  const desc = timelineOf(worker, provider, TENANT_A);
  assert.deepEqual(
    desc.events.map((e) => e.event_id),
    ['e3', 'e2', 'e1'],
    'default order is created_at DESC',
  );

  const asc = timelineOf(worker, provider, TENANT_A, { order: 'asc' });
  assert.deepEqual(
    asc.events.map((e) => e.event_id),
    ['e1', 'e2', 'e3'],
    'opts.order asc reverses to created_at ASC',
  );
});

test('total_events equals the number of timeline entries and tenant_id echoes the input', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    businessEvent('e1', 'finance.journal.draft_created', {
      created_at: '2026-05-21T01:00:00.000Z',
    }),
  );
  await runner.dispatch(
    businessEvent('e2', 'finance.journal.posted', {
      created_at: '2026-05-21T02:00:00.000Z',
    }),
  );

  const timeline = timelineOf(worker, provider, TENANT_A);
  assert.equal(timeline.tenant_id, TENANT_A);
  assert.equal(timeline.total_events, 2);
  assert.equal(timeline.events.length, 2);
});

test('replay rebuilds an identical timeline and a repeated replay does not duplicate entries (keyed by event_id)', async () => {
  const events = [
    businessEvent('e1', 'finance.invoice.draft_created', {
      created_at: '2026-05-21T01:00:00.000Z',
    }),
    businessEvent('e2', 'finance.journal.posted', {
      created_at: '2026-05-21T02:00:00.000Z',
    }),
  ];
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: provider,
  });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.replay(AUDIT_TIMELINE_PROJECTION_NAME, TENANT_A);
  const first = timelineOf(worker, provider, TENANT_A);

  await runner.replay(AUDIT_TIMELINE_PROJECTION_NAME, TENANT_A);
  const second = timelineOf(worker, provider, TENANT_A);

  // `as_of` is generated per-call; compare everything else.
  assert.equal(second.tenant_id, first.tenant_id);
  assert.equal(second.total_events, first.total_events);
  assert.deepEqual(second.events, first.events, 'repeated replay reproduces identical entries');
  assert.equal(first.total_events, 2, 'repeated replay must not duplicate entries');
  assert.equal(second.events.length, 2);
});

test('replay and event-by-event dispatch produce the same timeline', async () => {
  const events = [
    businessEvent('e1', 'finance.invoice.draft_created', {
      created_at: '2026-05-21T01:00:00.000Z',
    }),
    businessEvent('e2', 'finance.invoice.submitted_for_approval', {
      created_at: '2026-05-21T02:00:00.000Z',
    }),
    businessEvent('e3', 'finance.approval.approved', {
      created_at: '2026-05-21T03:00:00.000Z',
    }),
  ];

  const providerReplay = createMemoryProjectionStoreProvider();
  const runnerReplay = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: providerReplay,
  });
  const workerReplay = createAuditTimelineProjectionWorker();
  runnerReplay.register(workerReplay);
  await runnerReplay.replay(AUDIT_TIMELINE_PROJECTION_NAME, TENANT_A);

  const providerDispatch = createMemoryProjectionStoreProvider();
  const runnerDispatch = makeRunner({ storeProvider: providerDispatch });
  const workerDispatch = createAuditTimelineProjectionWorker();
  runnerDispatch.register(workerDispatch);
  for (const event of events) {
    await runnerDispatch.dispatch(event);
  }

  const replayed = timelineOf(workerReplay, providerReplay, TENANT_A);
  const dispatched = timelineOf(workerDispatch, providerDispatch, TENANT_A);
  assert.deepEqual(dispatched.events, replayed.events);
  assert.equal(dispatched.total_events, replayed.total_events);
});

test('with includeInfrastructureEvents false (default), finance.audit.event_appended is NOT in the timeline and does not advance the cursor', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    infraEvent('infra-1', {
      created_at: '2026-05-21T01:00:00.000Z',
    }),
  );

  const timeline = timelineOf(worker, provider, TENANT_A);
  assert.equal(timeline.total_events, 0);
  assert.equal(timeline.events.length, 0);
  assert.equal(runner.status(AUDIT_TIMELINE_PROJECTION_NAME, TENANT_A).cursor, null);
});

test('with includeInfrastructureEvents true, finance.audit.event_appended IS in the timeline', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker({ includeInfrastructureEvents: true });
  runner.register(worker);

  await runner.dispatch(
    infraEvent('infra-1', {
      created_at: '2026-05-21T01:00:00.000Z',
      aggregate_id: 'audit-entry-1',
    }),
  );

  const timeline = timelineOf(worker, provider, TENANT_A);
  assert.equal(timeline.total_events, 1);
  assert.equal(timeline.events.length, 1);
  assert.equal(timeline.events[0].event_id, 'infra-1');
  assert.equal(timeline.events[0].event_type, 'finance.audit.event_appended');
});

test('timeline state is tenant-isolated', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    businessEvent('a1', 'finance.invoice.draft_created', {
      tenant_id: TENANT_A,
      created_at: '2026-05-21T01:00:00.000Z',
    }),
  );
  await runner.dispatch(
    businessEvent('b1', 'finance.journal.posted', {
      tenant_id: TENANT_B,
      created_at: '2026-05-21T01:00:00.000Z',
    }),
  );
  await runner.dispatch(
    businessEvent('b2', 'finance.approval.approved', {
      tenant_id: TENANT_B,
      created_at: '2026-05-21T02:00:00.000Z',
    }),
  );

  const tlA = timelineOf(worker, provider, TENANT_A);
  const tlB = timelineOf(worker, provider, TENANT_B);

  assert.equal(tlA.total_events, 1);
  assert.deepEqual(tlA.events.map((e) => e.event_id), ['a1']);
  assert.equal(tlA.tenant_id, TENANT_A);

  assert.equal(tlB.total_events, 2);
  assert.deepEqual(tlB.events.map((e) => e.event_id), ['b2', 'b1']);
  assert.equal(tlB.tenant_id, TENANT_B);
});

test('payload_summary is a non-empty string for a known event type', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createAuditTimelineProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    businessEvent('e1', 'finance.invoice.draft_created', {
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_abc123',
      created_at: '2026-05-21T01:00:00.000Z',
    }),
  );

  const timeline = timelineOf(worker, provider, TENANT_A);
  const summary = timeline.events[0].payload_summary;
  assert.equal(typeof summary, 'string');
  assert.ok(summary.length > 0, 'payload_summary must not be empty');
});
