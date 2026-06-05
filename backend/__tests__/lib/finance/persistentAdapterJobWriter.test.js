/**
 * persistentAdapterJobWriter.test.js
 *
 * Codex PR #633 P1 — materialize finance.adapter_jobs rows from captured adapter
 * events so the SQL adapter worker can claim them. Spy-driven (no real DB).
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  materializeAdapterJobs,
  adapterJobStatusForEvent,
} from '../../../lib/finance/persistentAdapterJobWriter.js';

const TENANT = '00000000-0000-4000-8000-000000000011';
const NOOP_LOGGER = { warn: () => {}, info: () => {}, error: () => {}, debug: () => {} };

function fakePool() {
  const queries = [];
  return {
    queries,
    async query(sql, params) {
      queries.push({ sql, params });
      return { rowCount: 1 };
    },
  };
}

function adapterEvent(eventType, jobId, extra = {}) {
  const envTenant = extra.tenant ?? TENANT;
  return {
    id: `evt-${jobId}`,
    tenant_id: envTenant,
    event_type: eventType,
    payload: {
      ...(extra.permanent !== undefined ? { permanent: extra.permanent } : {}),
      ...(extra.nextAttemptAt !== undefined ? { next_attempt_at: extra.nextAttemptAt } : {}),
      adapter_job: {
        id: jobId,
        tenant_id: envTenant,
        provider: 'quickbooks',
        aggregate_type: 'journal_entry',
        aggregate_id: 'je-1',
        operation: 'push_draft',
        mode: 'draft_only',
        attempts: extra.attempts ?? 0,
      },
    },
  };
}

// params index → column (matches UPSERT_SQL order in persistentAdapterJobWriter.js)
const P = {
  id: 0,
  tenant: 1,
  provider: 2,
  status: 7,
  attempts: 8,
  next_attempt_at: 9,
};

test('materializeAdapterJobs upserts a draft from approval.requested', async () => {
  const pool = fakePool();
  const { written } = await materializeAdapterJobs({
    pool,
    tenantId: TENANT,
    events: [adapterEvent('finance.approval.requested', 'job-1')],
    logger: NOOP_LOGGER,
  });
  assert.equal(written, 1);
  assert.equal(pool.queries.length, 1);
  assert.match(pool.queries[0].sql, /INSERT INTO finance\.adapter_jobs/);
  assert.match(pool.queries[0].sql, /ON CONFLICT \(id\) DO UPDATE/);
  assert.equal(pool.queries[0].params[P.id], 'job-1');
  assert.equal(pool.queries[0].params[P.tenant], TENANT);
  assert.equal(pool.queries[0].params[P.status], 'draft');
});

test('materializeAdapterJobs upserts queued from sync_queued', async () => {
  const pool = fakePool();
  await materializeAdapterJobs({
    pool,
    tenantId: TENANT,
    events: [adapterEvent('finance.adapter.sync_queued', 'job-1', { attempts: 1 })],
    logger: NOOP_LOGGER,
  });
  assert.equal(pool.queries[0].params[P.status], 'queued');
  assert.equal(pool.queries[0].params[P.attempts], 1);
});

test('materializeAdapterJobs: a TRANSIENT sync_failed upserts queued + next_attempt_at', async () => {
  const pool = fakePool();
  await materializeAdapterJobs({
    pool,
    tenantId: TENANT,
    events: [
      adapterEvent('finance.adapter.sync_failed', 'job-1', {
        permanent: false,
        nextAttemptAt: '2026-05-21T01:05:00.000Z',
        attempts: 2,
      }),
    ],
    logger: NOOP_LOGGER,
  });
  assert.equal(pool.queries[0].params[P.status], 'queued');
  assert.equal(pool.queries[0].params[P.next_attempt_at], '2026-05-21T01:05:00.000Z');
});

test('materializeAdapterJobs: a PERMANENT sync_failed upserts failed', async () => {
  const pool = fakePool();
  await materializeAdapterJobs({
    pool,
    tenantId: TENANT,
    events: [adapterEvent('finance.adapter.sync_failed', 'job-1', { permanent: true })],
    logger: NOOP_LOGGER,
  });
  assert.equal(pool.queries[0].params[P.status], 'failed');
});

test('materializeAdapterJobs ignores non-adapter events and foreign-tenant rows', async () => {
  const pool = fakePool();
  const { written } = await materializeAdapterJobs({
    pool,
    tenantId: TENANT,
    events: [
      { event_type: 'finance.journal.posted', tenant_id: TENANT, payload: {} },
      adapterEvent('finance.adapter.sync_queued', 'foreign', { tenant: 'other-tenant' }),
    ],
    logger: NOOP_LOGGER,
  });
  assert.equal(written, 0, 'no adapter job for this tenant');
  assert.equal(pool.queries.length, 0);
});

test('materializeAdapterJobs is a no-op without a pool (in-memory / test path)', async () => {
  const { written } = await materializeAdapterJobs({
    pool: null,
    tenantId: TENANT,
    events: [adapterEvent('finance.adapter.sync_queued', 'job-1')],
    logger: NOOP_LOGGER,
  });
  assert.equal(written, 0);
});

test('materializeAdapterJobs is NON-FATAL when the upsert throws', async () => {
  const warns = [];
  const pool = {
    async query() {
      throw new Error('pg down');
    },
  };
  const { written } = await materializeAdapterJobs({
    pool,
    tenantId: TENANT,
    events: [adapterEvent('finance.adapter.sync_queued', 'job-1')],
    logger: { ...NOOP_LOGGER, warn: (...a) => warns.push(a) },
  });
  assert.equal(written, 0);
  assert.ok(warns.length >= 1, 'upsert failure is logged, not thrown');
});

test('adapterJobStatusForEvent maps event types (transient vs permanent)', () => {
  assert.equal(adapterJobStatusForEvent({ event_type: 'finance.approval.requested' }), 'draft');
  assert.equal(adapterJobStatusForEvent({ event_type: 'finance.adapter.sync_queued' }), 'queued');
  assert.equal(
    adapterJobStatusForEvent({ event_type: 'finance.adapter.sync_succeeded' }),
    'succeeded',
  );
  assert.equal(
    adapterJobStatusForEvent({
      event_type: 'finance.adapter.sync_failed',
      payload: { permanent: false },
    }),
    'queued',
  );
  assert.equal(
    adapterJobStatusForEvent({
      event_type: 'finance.adapter.sync_failed',
      payload: { permanent: true },
    }),
    'failed',
  );
  assert.equal(adapterJobStatusForEvent({ event_type: 'finance.journal.posted' }), null);
});
