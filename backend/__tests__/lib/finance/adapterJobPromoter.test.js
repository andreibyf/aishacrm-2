import test from 'node:test';
import assert from 'node:assert/strict';
import { promoteLinkedAdapterJobs } from '../../../lib/finance/adapterJobPromoter.js';
import createFinanceEventStore from '../../../lib/finance/financeEventStore.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000002';

function makeBucket(adapterJobs = []) {
  return {
    journalEntries: [],
    invoices: [],
    approvals: [],
    adapterJobs,
    commands: [],
  };
}

function makeDraftJob(overrides = {}) {
  return {
    id: 'adapter_job_test_1',
    tenant_id: TENANT_ID,
    status: 'draft',
    provider: 'quickbooks',
    aggregate_type: 'journal_entry',
    aggregate_id: 'je_test_1',
    operation: 'push_draft',
    mode: 'draft_only',
    attempts: 0,
    created_at: '2026-05-24T00:00:00.000Z',
    updated_at: '2026-05-24T00:00:00.000Z',
    ...overrides,
  };
}

test('promoteLinkedAdapterJobs requires tenantId', async () => {
  await assert.rejects(
    () =>
      promoteLinkedAdapterJobs({
        bucket: makeBucket(),
        aggregateId: 'je_x',
        eventStore: { append: async () => {} },
      }),
    /tenantId is required/i,
  );
});

test('promoteLinkedAdapterJobs requires aggregateId', async () => {
  await assert.rejects(
    () =>
      promoteLinkedAdapterJobs({
        bucket: makeBucket(),
        tenantId: TENANT_ID,
        eventStore: { append: async () => {} },
      }),
    /aggregateId is required/i,
  );
});

test('promoteLinkedAdapterJobs requires eventStore.append', async () => {
  await assert.rejects(
    () =>
      promoteLinkedAdapterJobs({
        bucket: makeBucket(),
        tenantId: TENANT_ID,
        aggregateId: 'je_x',
      }),
    /eventStore\.append is required/i,
  );
});

test('promoteLinkedAdapterJobs rejects when both pool and bucket are passed', async () => {
  await assert.rejects(
    () =>
      promoteLinkedAdapterJobs({
        pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
        bucket: makeBucket(),
        tenantId: TENANT_ID,
        aggregateId: 'je_x',
        eventStore: { append: async () => {} },
      }),
    /pass either `pool` or `bucket`, not both/i,
  );
});

test('promoteLinkedAdapterJobs in-memory: finds draft jobs by aggregate_id, promotes draft → queued, emits one sync_queued per job', async () => {
  const job1 = makeDraftJob({ id: 'job_1', aggregate_id: 'je_42' });
  const job2 = makeDraftJob({ id: 'job_2', aggregate_id: 'je_42', provider: 'xero' });
  const bucket = makeBucket([job1, job2]);
  const eventStore = createFinanceEventStore();

  const result = await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_42',
    eventStore,
    actor: { id: 'user-1', type: 'human' },
  });

  assert.equal(result.promoted_count, 2);
  assert.equal(job1.status, 'queued');
  assert.equal(job2.status, 'queued');

  const events = eventStore.replay(TENANT_ID);
  const queuedEvents = events.filter((e) => e.event_type === 'finance.adapter.sync_queued');
  assert.equal(queuedEvents.length, 2, 'one sync_queued event per promoted job');

  // Verify Track A envelope: aggregate_type='adapter_job', aggregate_id=job.id (NOT object_type/object_id drift)
  for (const evt of queuedEvents) {
    assert.equal(evt.aggregate_type, 'adapter_job');
    assert.ok(['job_1', 'job_2'].includes(evt.aggregate_id));
    assert.equal(evt.tenant_id, TENANT_ID);
    assert.equal(
      evt.payload.adapter_job.status,
      'queued',
      'snapshot in payload shows post-transition status',
    );
  }
});

test('promoteLinkedAdapterJobs in-memory: skips jobs not in draft status (idempotency via status filter)', async () => {
  const draftJob = makeDraftJob({ id: 'job_draft', aggregate_id: 'je_77' });
  const alreadyQueuedJob = makeDraftJob({
    id: 'job_queued',
    aggregate_id: 'je_77',
    status: 'queued',
  });
  const succeededJob = makeDraftJob({ id: 'job_done', aggregate_id: 'je_77', status: 'succeeded' });
  const bucket = makeBucket([draftJob, alreadyQueuedJob, succeededJob]);
  const eventStore = createFinanceEventStore();

  const result = await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_77',
    eventStore,
  });

  assert.equal(result.promoted_count, 1, 'only the draft job is promoted');
  assert.equal(draftJob.status, 'queued');
  assert.equal(alreadyQueuedJob.status, 'queued', 'already-queued unchanged');
  assert.equal(succeededJob.status, 'succeeded', 'succeeded unchanged');

  const events = eventStore.replay(TENANT_ID);
  const queuedEvents = events.filter((e) => e.event_type === 'finance.adapter.sync_queued');
  assert.equal(
    queuedEvents.length,
    1,
    'exactly one sync_queued — no double-emit for already-queued jobs',
  );
});

test('promoteLinkedAdapterJobs in-memory: re-calling on same approval emits zero new events (full idempotency)', async () => {
  const job = makeDraftJob({ id: 'job_idem', aggregate_id: 'je_idem' });
  const bucket = makeBucket([job]);
  const eventStore = createFinanceEventStore();

  await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_idem',
    eventStore,
  });
  const result2 = await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_idem',
    eventStore,
  });

  assert.equal(result2.promoted_count, 0, 'second call promotes nothing');
  const events = eventStore.replay(TENANT_ID);
  const queuedEvents = events.filter((e) => e.event_type === 'finance.adapter.sync_queued');
  assert.equal(queuedEvents.length, 1, 'still only one sync_queued event total');
});

test('promoteLinkedAdapterJobs in-memory: scopes by tenant_id (does not promote other tenants jobs)', async () => {
  const ownJob = makeDraftJob({ id: 'job_own', aggregate_id: 'je_shared' });
  const otherTenantJob = makeDraftJob({
    id: 'job_other',
    tenant_id: OTHER_TENANT_ID,
    aggregate_id: 'je_shared',
  });
  const bucket = makeBucket([ownJob, otherTenantJob]);
  const eventStore = createFinanceEventStore();

  const result = await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_shared',
    eventStore,
  });

  assert.equal(result.promoted_count, 1);
  assert.equal(ownJob.status, 'queued');
  assert.equal(otherTenantJob.status, 'draft', 'other tenant job untouched');
});

test('promoteLinkedAdapterJobs in-memory: no-op when no draft jobs match aggregate_id', async () => {
  const job = makeDraftJob({ aggregate_id: 'je_other' });
  const bucket = makeBucket([job]);
  const eventStore = createFinanceEventStore();

  const result = await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_nonexistent',
    eventStore,
  });

  assert.equal(result.promoted_count, 0);
  assert.equal(job.status, 'draft', 'unrelated job untouched');

  const events = eventStore.replay(TENANT_ID);
  assert.equal(events.length, 0, 'no events emitted when no jobs promoted');
});

test('promoteLinkedAdapterJobs in-memory: sync_queued payload carries the canonical fields per §4.7', async () => {
  const job = makeDraftJob({
    id: 'job_payload',
    aggregate_id: 'je_payload',
    provider: 'erpnext',
    operation: 'push_draft',
    mode: 'draft_only',
    aggregate_type: 'journal_entry',
  });
  const bucket = makeBucket([job]);
  const eventStore = createFinanceEventStore();
  const fixedTime = '2026-06-01T12:00:00.000Z';

  await promoteLinkedAdapterJobs({
    bucket,
    tenantId: TENANT_ID,
    aggregateId: 'je_payload',
    eventStore,
    now: () => fixedTime,
  });

  const events = eventStore.replay(TENANT_ID);
  const evt = events[0];
  assert.equal(evt.event_type, 'finance.adapter.sync_queued');
  assert.equal(evt.aggregate_type, 'adapter_job');
  assert.equal(evt.aggregate_id, 'job_payload');
  // Payload shape per §4.7
  assert.equal(evt.payload.job_id, 'job_payload');
  assert.equal(evt.payload.provider, 'erpnext');
  assert.equal(evt.payload.object_type, 'journal_entry');
  assert.equal(evt.payload.object_id, 'je_payload');
  assert.equal(evt.payload.operation, 'push_draft');
  assert.equal(evt.payload.mode, 'draft_only');
  assert.equal(evt.payload.queued_at, fixedTime);
  // Embedded adapter_job snapshot
  assert.equal(evt.payload.adapter_job.status, 'queued');
  assert.equal(evt.payload.adapter_job.id, 'job_payload');
});

test('promoteLinkedAdapterJobs persistent mode: uses transaction with FOR UPDATE SKIP LOCKED', async () => {
  const calls = [];
  const draftRow = {
    id: 'job_pg_1',
    tenant_id: TENANT_ID,
    provider: 'erpnext',
    aggregate_type: 'journal_entry',
    aggregate_id: 'je_pg_1',
    operation: 'push_draft',
    mode: 'draft_only',
    status: 'draft',
    attempts: 0,
    created_at: '2026-05-24T00:00:00.000Z',
    updated_at: '2026-05-24T00:00:00.000Z',
    payload: {},
  };
  const updatedRow = { ...draftRow, status: 'queued', updated_at: '2026-06-01T00:00:00.000Z' };

  const fakeClient = {
    query: async (sql, params) => {
      const normalized = sql.trim();
      calls.push({ sql: normalized, params });
      if (normalized.startsWith('BEGIN')) return {};
      if (normalized.startsWith('COMMIT')) return {};
      if (normalized.startsWith('ROLLBACK')) return {};
      if (normalized.includes('FOR UPDATE SKIP LOCKED')) return { rows: [draftRow] };
      if (normalized.startsWith('UPDATE finance.adapter_jobs')) {
        return { rows: [updatedRow] };
      }
      return { rows: [] };
    },
    release: () => calls.push({ released: true }),
  };
  const fakePool = { connect: async () => fakeClient };
  const eventStore = createFinanceEventStore();

  const result = await promoteLinkedAdapterJobs({
    pool: fakePool,
    tenantId: TENANT_ID,
    aggregateId: 'je_pg_1',
    eventStore,
  });

  assert.equal(result.promoted_count, 1);
  // Verify transaction discipline
  const sqls = calls.filter((c) => c.sql).map((c) => c.sql);
  assert.ok(
    sqls.some((s) => s.startsWith('BEGIN')),
    'BEGIN issued',
  );
  assert.ok(
    sqls.some((s) => s.includes('FOR UPDATE SKIP LOCKED')),
    'lock query issued',
  );
  assert.ok(
    sqls.some((s) => s.startsWith('UPDATE finance.adapter_jobs')),
    'update query issued',
  );
  assert.ok(
    sqls.some((s) => s.startsWith('COMMIT')),
    'COMMIT issued',
  );
  assert.ok(
    calls.some((c) => c.released),
    'client released',
  );

  const events = eventStore.replay(TENANT_ID);
  assert.equal(events.length, 1);
  assert.equal(events[0].event_type, 'finance.adapter.sync_queued');
});

test('promoteLinkedAdapterJobs persistent mode: rolls back on error and releases client', async () => {
  let rolledBack = false;
  let released = false;
  const fakeClient = {
    query: async (sql) => {
      if (sql.startsWith('BEGIN')) return {};
      if (sql.startsWith('ROLLBACK')) {
        rolledBack = true;
        return {};
      }
      if (sql.includes('FOR UPDATE SKIP LOCKED')) {
        throw new Error('simulated DB failure');
      }
      return { rows: [] };
    },
    release: () => {
      released = true;
    },
  };
  const fakePool = { connect: async () => fakeClient };

  await assert.rejects(
    () =>
      promoteLinkedAdapterJobs({
        pool: fakePool,
        tenantId: TENANT_ID,
        aggregateId: 'je_x',
        eventStore: { append: async () => {} },
      }),
    /simulated DB failure/,
  );
  assert.equal(rolledBack, true, 'rollback issued');
  assert.equal(released, true, 'client released even on failure');
});
