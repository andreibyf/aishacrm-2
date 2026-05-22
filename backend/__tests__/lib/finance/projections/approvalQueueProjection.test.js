import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import {
  createApprovalQueueProjectionWorker,
  APPROVAL_QUEUE_PROJECTION_NAME,
} from '../../../../lib/finance/projections/approvalQueueProjection.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// ── Test doubles ──────────────────────────────────────────────────────────────

// A finance.approval.requested event. `payload.approval` mirrors the approval
// record shape produced by buildApprovalRecord() in financeDomainService.js.
function approvalRequested(
  id,
  {
    approvalId = `approval_${id}`,
    tenant = TENANT_A,
    createdAt = '2026-05-21T00:00:00.000Z',
    targetType = 'journal_entry',
    targetId = `je-${id}`,
    riskLevel = 'high',
    requestedBy = 'user_requester',
    approvalPolicy = 'finance.high_value.approval_required',
    escalationTarget = 'finance_controller',
  } = {},
) {
  return {
    id,
    tenant_id: tenant,
    event_type: 'finance.approval.requested',
    created_at: createdAt,
    aggregate_type: 'approval',
    aggregate_id: approvalId,
    actor_id: requestedBy,
    payload: {
      approval: {
        id: approvalId,
        tenant_id: tenant,
        target_type: targetType,
        target_id: targetId,
        status: 'pending',
        requested_by: requestedBy,
        requested_at: createdAt,
        created_at: createdAt,
        approval_policy: approvalPolicy,
        escalation_target: escalationTarget,
        risk_level: riskLevel,
      },
    },
  };
}

// A finance.approval.{approved,rejected,cancelled} event. The runtime resolves
// an approval by `payload.approval.id`; the resolver identity comes from the
// envelope `actor_id` and the resolution timestamp from `created_at`.
function approvalResolved(
  eventType,
  id,
  {
    approvalId = `approval_${id}`,
    tenant = TENANT_A,
    createdAt = '2026-05-21T01:00:00.000Z',
    resolvedBy = 'user_approver',
  } = {},
) {
  return {
    id,
    tenant_id: tenant,
    event_type: eventType,
    created_at: createdAt,
    aggregate_type: 'approval',
    aggregate_id: approvalId,
    actor_id: resolvedBy,
    payload: { approval: { id: approvalId } },
  };
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

function queueOf(worker, provider, tenantId) {
  return worker.getProjection(
    tenantId,
    {},
    provider.getLiveStore(APPROVAL_QUEUE_PROJECTION_NAME, tenantId),
  );
}

// ── requested -> pending ──────────────────────────────────────────────────────

test('a finance.approval.requested event adds a pending queue entry', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    approvalRequested('e1', {
      approvalId: 'approval_1',
      targetId: 'je-1',
      riskLevel: 'critical',
      requestedBy: 'user_alice',
      approvalPolicy: 'finance.high_value.approval_required',
      escalationTarget: 'finance_controller',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 1);
  assert.equal(queue.resolved.length, 0);

  assert.deepEqual(queue.pending[0], {
    approval_id: 'approval_1',
    tenant_id: TENANT_A,
    target_type: 'journal_entry',
    target_id: 'je-1',
    risk_level: 'critical',
    requested_by: 'user_alice',
    created_at: '2026-05-21T00:00:00.000Z',
    approval_policy: 'finance.high_value.approval_required',
    escalation_target: 'finance_controller',
  });
});

// ── resolution removes pending, adds resolved ─────────────────────────────────

test('finance.approval.approved removes the pending entry and adds a resolved entry', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    approvalRequested('e1', {
      approvalId: 'approval_1',
      targetId: 'je-1',
      createdAt: '2026-05-21T00:00:00.000Z',
    }),
  );
  await runner.dispatch(
    approvalResolved('finance.approval.approved', 'e2', {
      approvalId: 'approval_1',
      createdAt: '2026-05-21T02:00:00.000Z',
      resolvedBy: 'user_boss',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 0);
  assert.equal(queue.resolved.length, 1);

  assert.deepEqual(queue.resolved[0], {
    approval_id: 'approval_1',
    status: 'approved',
    resolved_by: 'user_boss',
    resolved_at: '2026-05-21T02:00:00.000Z',
    target_type: 'journal_entry',
    target_id: 'je-1',
  });
});

test('finance.approval.rejected removes the pending entry and adds a resolved entry', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    approvalRequested('e1', {
      approvalId: 'approval_1',
      targetId: 'je-1',
      createdAt: '2026-05-21T00:00:00.000Z',
    }),
  );
  await runner.dispatch(
    approvalResolved('finance.approval.rejected', 'e2', {
      approvalId: 'approval_1',
      createdAt: '2026-05-21T02:00:00.000Z',
      resolvedBy: 'user_boss',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 0);
  assert.equal(queue.resolved.length, 1);
  assert.equal(queue.resolved[0].status, 'rejected');
  assert.equal(queue.resolved[0].resolved_by, 'user_boss');
  assert.equal(queue.resolved[0].resolved_at, '2026-05-21T02:00:00.000Z');
});

test('finance.approval.cancelled removes the pending entry and adds a resolved entry', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    approvalRequested('e1', {
      approvalId: 'approval_1',
      targetId: 'je-1',
      createdAt: '2026-05-21T00:00:00.000Z',
    }),
  );
  await runner.dispatch(
    approvalResolved('finance.approval.cancelled', 'e2', {
      approvalId: 'approval_1',
      createdAt: '2026-05-21T02:00:00.000Z',
      resolvedBy: 'user_alice',
    }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 0);
  assert.equal(queue.resolved.length, 1);
  assert.equal(queue.resolved[0].status, 'cancelled');
});

// ── Replay rebuild (acceptance) ────────────────────────────────────────────────

test('replay and event-by-event dispatch rebuild identical pending/resolved queues', async () => {
  const events = [
    approvalRequested('e1', { approvalId: 'approval_1', createdAt: '2026-05-21T01:00:00.000Z' }),
    approvalRequested('e2', { approvalId: 'approval_2', createdAt: '2026-05-21T02:00:00.000Z' }),
    approvalResolved('finance.approval.approved', 'e3', {
      approvalId: 'approval_1',
      createdAt: '2026-05-21T03:00:00.000Z',
    }),
  ];

  const providerReplay = createMemoryProjectionStoreProvider();
  const runnerReplay = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: providerReplay,
  });
  const workerReplay = createApprovalQueueProjectionWorker();
  runnerReplay.register(workerReplay);
  await runnerReplay.replay(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A);

  const providerDispatch = createMemoryProjectionStoreProvider();
  const runnerDispatch = makeRunner({ storeProvider: providerDispatch });
  const workerDispatch = createApprovalQueueProjectionWorker();
  runnerDispatch.register(workerDispatch);
  for (const event of events) {
    await runnerDispatch.dispatch(event);
  }

  assert.deepEqual(
    queueOf(workerReplay, providerReplay, TENANT_A),
    queueOf(workerDispatch, providerDispatch, TENANT_A),
  );
});

test('a repeated replay does not duplicate queue entries', async () => {
  const events = [
    approvalRequested('e1', { approvalId: 'approval_1', createdAt: '2026-05-21T01:00:00.000Z' }),
    approvalRequested('e2', { approvalId: 'approval_2', createdAt: '2026-05-21T02:00:00.000Z' }),
    approvalResolved('finance.approval.cancelled', 'e3', {
      approvalId: 'approval_2',
      createdAt: '2026-05-21T03:00:00.000Z',
    }),
  ];
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({
    eventStore: fakeEventStore({ [TENANT_A]: events }),
    storeProvider: provider,
  });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.replay(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A);
  const first = queueOf(worker, provider, TENANT_A);

  await runner.replay(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A);
  const second = queueOf(worker, provider, TENANT_A);

  assert.deepEqual(second, first, 'a repeated replay reproduces identical queue state');
  assert.equal(first.pending.length, 1, 'one approval still pending');
  assert.equal(first.resolved.length, 1, 'one approval resolved — never duplicated');
});

// ── Pending uniqueness invariant ───────────────────────────────────────────────

// There may never be two active pending records for the same approval_id within
// a tenant projection — the store is keyed by approval_id.
test('a duplicate finance.approval.requested never yields two pending records for one approval', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    approvalRequested('e1', { approvalId: 'approval_1', createdAt: '2026-05-21T01:00:00.000Z' }),
  );
  await runner.dispatch(
    approvalRequested('e2', { approvalId: 'approval_1', createdAt: '2026-05-21T02:00:00.000Z' }),
  );

  assert.equal(queueOf(worker, provider, TENANT_A).pending.length, 1);
});

// finance.approval.requested is create-only: once an approval is resolved, a
// later duplicate request must not move it back into the pending queue.
test('a duplicate finance.approval.requested does not reopen an already-resolved approval', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(
    approvalRequested('e1', { approvalId: 'approval_1', createdAt: '2026-05-21T01:00:00.000Z' }),
  );
  await runner.dispatch(
    approvalResolved('finance.approval.approved', 'e2', {
      approvalId: 'approval_1',
      createdAt: '2026-05-21T02:00:00.000Z',
      resolvedBy: 'user_boss',
    }),
  );
  // A duplicate finance.approval.requested arrives after resolution.
  await runner.dispatch(
    approvalRequested('e3', { approvalId: 'approval_1', createdAt: '2026-05-21T03:00:00.000Z' }),
  );

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 0, 'a resolved approval is never reopened');
  assert.equal(queue.resolved.length, 1);
  assert.deepEqual(queue.resolved[0], {
    approval_id: 'approval_1',
    status: 'approved',
    resolved_by: 'user_boss',
    resolved_at: '2026-05-21T02:00:00.000Z',
    target_type: 'journal_entry',
    target_id: 'je-e1',
  });
});

// ── Tenant isolation (acceptance) ──────────────────────────────────────────────

test('approval queue state is isolated per tenant', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch(approvalRequested('a1', { approvalId: 'approval_a', tenant: TENANT_A }));
  await runner.dispatch(approvalRequested('b1', { approvalId: 'approval_b', tenant: TENANT_B }));

  const queueA = queueOf(worker, provider, TENANT_A);
  const queueB = queueOf(worker, provider, TENANT_B);
  assert.equal(queueA.pending.length, 1);
  assert.equal(queueA.pending[0].approval_id, 'approval_a');
  assert.equal(queueB.pending.length, 1);
  assert.equal(queueB.pending[0].approval_id, 'approval_b');
});

// The runner scopes the store by the event envelope tenant_id; the read-model
// tenant_id must come from that envelope, never from a stale/wrong payload.
test('a pending entry takes its tenant_id from the event envelope, not payload.approval', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  const event = approvalRequested('e1', { approvalId: 'approval_1', tenant: TENANT_A });
  // A stale / wrong payload tenant that disagrees with the envelope.
  event.payload.approval.tenant_id = TENANT_B;
  await runner.dispatch(event);

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 1);
  assert.equal(
    queue.pending[0].tenant_id,
    TENANT_A,
    'the read-model tenant_id is the authoritative envelope tenant',
  );
});

// ── Event filtering (acceptance) ───────────────────────────────────────────────

test('the approval queue projection ignores finance.audit.event_appended', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch({
    id: 'infra-1',
    tenant_id: TENANT_A,
    event_type: 'finance.audit.event_appended',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });

  const queue = queueOf(worker, provider, TENANT_A);
  assert.equal(queue.pending.length, 0);
  assert.equal(queue.resolved.length, 0);
  assert.equal(runner.status(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A).cursor, null);
});

test('the approval queue projection ignores events it does not consume', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  await runner.dispatch({
    id: 'jp-1',
    tenant_id: TENANT_A,
    event_type: 'finance.journal.posted',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });

  assert.equal(queueOf(worker, provider, TENANT_A).pending.length, 0);
});

// ── Degraded behavior (acceptance) ─────────────────────────────────────────────

test('a malformed finance.approval.requested degrades the projection and pauses later dispatch', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  // Malformed: a finance.approval.requested with no approval payload.
  await runner.dispatch({
    id: 'bad',
    tenant_id: TENANT_A,
    event_type: 'finance.approval.requested',
    created_at: '2026-05-21T01:00:00.000Z',
    payload: {},
  });
  assert.equal(runner.status(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A).is_degraded, true);

  // A subsequent valid request is paused while degraded.
  await runner.dispatch(
    approvalRequested('e2', { approvalId: 'approval_2', createdAt: '2026-05-21T02:00:00.000Z' }),
  );
  assert.equal(
    queueOf(worker, provider, TENANT_A).pending.length,
    0,
    'while degraded, later events are not applied to the queue',
  );
  assert.equal(runner.status(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A).cursor, null);
});

test('a resolution event for an unknown approval degrades the projection', async () => {
  const provider = createMemoryProjectionStoreProvider();
  const runner = makeRunner({ storeProvider: provider });
  const worker = createApprovalQueueProjectionWorker();
  runner.register(worker);

  // No prior finance.approval.requested for this approval_id.
  await runner.dispatch(
    approvalResolved('finance.approval.approved', 'orphan', {
      approvalId: 'approval_never_requested',
      createdAt: '2026-05-21T01:00:00.000Z',
    }),
  );

  assert.equal(runner.status(APPROVAL_QUEUE_PROJECTION_NAME, TENANT_A).is_degraded, true);
  assert.equal(queueOf(worker, provider, TENANT_A).resolved.length, 0);
});
