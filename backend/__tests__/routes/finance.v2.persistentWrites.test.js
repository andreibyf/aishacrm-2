/**
 * finance.v2.persistentWrites.test.js
 *
 * Phase 4-1 Task 8 — the activation capstone acceptance suite.
 *
 * Persistent mode now MOUNTS and routes the 6 mutating endpoints through the
 * persistent write runner. These two tests prove the end-to-end behaviour the
 * boot guard previously made impossible, using SHARED in-memory doubles
 * (event store + projection-store provider) injected via opts so the READ path
 * and the WRITE path observe the same state:
 *
 *  A. durable mutation — an approval that exists ONLY in the durable event
 *     store (never in this process's in-memory bucket) can be approved. Proves
 *     the write hydrates the bucket from the event stream (no spurious 404).
 *
 *  B. read-your-write — a journal draft created via POST is immediately visible
 *     via GET. Proves the write synchronously advances the projections the read
 *     adapter serves from.
 */

import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import createFinanceV2Routes from '../../routes/finance.v2.js';
import createFinanceEventStore from '../../lib/finance/financeEventStore.js';
import createFinanceEventEnvelope from '../../lib/finance/financeEventEnvelope.js';
import { createMemoryProjectionStoreProvider } from '../../lib/finance/projections/projectionStore.memory.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000011';

// A truthy dummy pool so the factory's no-pool guard passes; the injected
// in-memory stores are what actually get exercised.
const DUMMY_POOL = {};

let PREV_FLAG;

beforeEach(() => {
  PREV_FLAG = process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
  process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = 'true';
});

afterEach(() => {
  if (PREV_FLAG === undefined) delete process.env.ENABLE_FINANCE_PERSISTENT_EVENTS;
  else process.env.ENABLE_FINANCE_PERSISTENT_EVENTS = PREV_FLAG;
});

// Build a persistent-mode app over a SHARED in-memory event store + projection
// store provider. Returning the SAME provider instance from createStoreProvider
// means the read adapter and the write runner advance/read the same live store.
function buildPersistentApp({ user, dataMode = 'live', getFinanceDataMode } = {}) {
  const eventStore = createFinanceEventStore();
  const storeProvider = createMemoryProjectionStoreProvider();

  const authedUser = user || {
    id: 'human-user-1',
    role: 'admin',
    tenant_id: TENANT_ID,
    tenant_uuid: TENANT_ID,
  };

  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { ...authedUser };
    next();
  });
  app.use(
    '/api/v2/finance',
    createFinanceV2Routes(DUMMY_POOL, {
      isFinanceModuleEnabled: async () => true,
      eventStore,
      createStoreProvider: () => storeProvider,
      // Slice 6b-1: runWrite now resolves the tenant data mode to thread the
      // active partition into HYDRATE + the projection REBUILD. Inject it so the
      // write path does NOT fall back to the real Supabase-backed resolver. The
      // acceptance suite seeds default-live (is_test_data=false) events, so the
      // default app builds in 'live' mode (isTestData=false).
      getFinanceDataMode: getFinanceDataMode || (async () => dataMode),
    }),
  );

  return { app, eventStore, storeProvider };
}

describe('finance.v2 persistent writes (Phase 4-1 Task 8 activation)', () => {
  // Acceptance A — durable mutation (the core Codex fix). The approval lives
  // ONLY in the durable event store; the in-process bucket is empty. The write
  // runner hydrates the bucket from the stream, so the approve resolves the
  // durable approval instead of 404-ing on an empty bucket.
  test('A: approves an approval that exists only in the durable event store (no 404)', async () => {
    const { app, eventStore } = buildPersistentApp();

    // Pre-append a finance.approval.requested event directly into the shared
    // durable event store — the same envelope shape simulateDealWon emits. The
    // bucket-replay fold upserts payload.approval into the hydrated bucket so
    // approveFinanceAction's `bucket.approvals.find` locates it.
    const requestedAt = new Date().toISOString();
    eventStore.append(
      createFinanceEventEnvelope({
        tenantId: TENANT_ID,
        eventType: 'finance.approval.requested',
        aggregateType: 'approval',
        aggregateId: 'A',
        actorId: 'requester',
        actorType: 'human',
        payload: {
          approval: {
            id: 'A',
            tenant_id: TENANT_ID,
            target_type: 'journal_entry',
            target_id: 'j1',
            status: 'pending',
            requested_by: 'requester',
            requested_at: requestedAt,
          },
        },
      }),
    );

    const res = await request(app).post('/api/v2/finance/approvals/A/approve').send({});

    // SUCCESS (200), NOT 404 — proves the durable approval was hydrated.
    assert.equal(res.status, 200, `expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.status, 'success');
    assert.equal(res.body.data.approval.id, 'A');
    assert.equal(res.body.data.approval.status, 'approved');
    assert.equal(res.body.data.approval.approved_by, 'human-user-1');

    // Read-your-write CONSISTENCY: the approval_queue projection must reflect the
    // approved transition — proving the advance CAUGHT UP the projection by
    // rebuild (not degraded). Before the fix, dispatching approval.approved onto
    // an approval_queue that never projected the prior `pending` entry degraded
    // the projection and this read would be stale/wrong.
    const listRes = await request(app).get('/api/v2/finance/approvals?status=all');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.status, 'success');
    const approvalA = listRes.body.data.approvals.find((a) => a.id === 'A');
    assert.ok(
      approvalA,
      `approval A should be visible via GET; got ${JSON.stringify(listRes.body.data.approvals)}`,
    );
    assert.equal(
      approvalA.status,
      'approved',
      'approval_queue projection is consistent (caught up, not degraded)',
    );
    assert.equal(approvalA.decided_by, 'human-user-1', 'decision actor recorded in the projection');
  });

  // Acceptance B — read-your-write. A journal draft created via POST is
  // immediately visible via GET because the write synchronously advances the
  // journal_entries projection the read adapter serves from.
  test('B: a journal draft created via POST is immediately visible via GET (read-your-write)', async () => {
    const { app } = buildPersistentApp();

    const createRes = await request(app)
      .post('/api/v2/finance/journal-drafts')
      .send({
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
          {
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 1000,
          },
        ],
      });

    assert.equal(
      createRes.status,
      201,
      `expected 201, got ${createRes.status}: ${JSON.stringify(createRes.body)}`,
    );
    const createdId = createRes.body.data.journal_entry.id;
    assert.ok(createdId, 'created journal entry should have an id');

    const listRes = await request(app).get('/api/v2/finance/journal-drafts');
    assert.equal(listRes.status, 200);
    assert.equal(listRes.body.status, 'success');
    assert.equal(listRes.body.data.source.mode, 'persistent');

    const drafts = listRes.body.data.journal_drafts;
    assert.ok(Array.isArray(drafts), 'journal_drafts should be an array');
    const found = drafts.find((d) => d.id === createdId);
    assert.ok(
      found,
      `just-created draft ${createdId} should be visible via GET; got ${JSON.stringify(drafts)}`,
    );
    assert.equal(found.status, 'draft');
  });

  // Slice 6b-1 — WRITE-SIDE SEGREGATION. In TEST mode, HYDRATE replays only the
  // test partition, so a test approval is visible (approvable) while a live
  // approval is NOT (the bucket never sees it ⇒ 404). This proves the active
  // data mode partitions the durable hydrate on the write path.
  test('test mode: approves a TEST approval but a LIVE approval is invisible (404)', async () => {
    const { app, eventStore } = buildPersistentApp({ dataMode: 'test' });

    function seedApprovalRequested(approvalId, isTestData) {
      eventStore.append(
        createFinanceEventEnvelope({
          tenantId: TENANT_ID,
          eventType: 'finance.approval.requested',
          aggregateType: 'approval',
          aggregateId: approvalId,
          actorId: 'requester',
          actorType: 'human',
          isTestData,
          payload: {
            approval: {
              id: approvalId,
              tenant_id: TENANT_ID,
              target_type: 'journal_entry',
              target_id: `j-${approvalId}`,
              status: 'pending',
              requested_by: 'requester',
              requested_at: new Date().toISOString(),
            },
          },
        }),
      );
    }

    // Approval A is a TEST event; approval B is a LIVE event.
    seedApprovalRequested('A', true);
    seedApprovalRequested('B', false);

    // In test mode, HYDRATE replays the test partition only ⇒ A is visible.
    const resA = await request(app).post('/api/v2/finance/approvals/A/approve').send({});
    assert.equal(
      resA.status,
      200,
      `expected 200 approving TEST approval A, got ${resA.status}: ${JSON.stringify(resA.body)}`,
    );
    assert.equal(resA.body.data.approval.id, 'A');
    assert.equal(resA.body.data.approval.status, 'approved');

    // The LIVE approval B is NOT in the test partition ⇒ the hydrated bucket
    // never sees it ⇒ approveFinanceAction 404s. This is the segregation proof:
    // a test-mode write cannot touch live data.
    const resB = await request(app).post('/api/v2/finance/approvals/B/approve').send({});
    assert.equal(
      resB.status,
      404,
      `expected 404 approving LIVE approval B in test mode, got ${resB.status}: ${JSON.stringify(
        resB.body,
      )}`,
    );
  });

  // Slice 6 (Codex P1) — READ-SIDE SEGREGATION. /audit-events and /evidence-packs
  // read the durable event stream DIRECTLY (not via the projection rebuild that
  // segregates the other reads), so they must filter by the active mode's
  // partition. Without the fix a `live` tenant receives dormant `test` events and
  // a `test` tenant receives live events on exactly these two endpoints.
  function seedAuditEvent(eventStore, { aggregateId, isTestData }) {
    eventStore.append(
      createFinanceEventEnvelope({
        tenantId: TENANT_ID,
        eventType: 'finance.journal.created',
        aggregateType: 'journal_entry',
        aggregateId,
        actorId: 'requester',
        actorType: 'human',
        isTestData,
        payload: { note: aggregateId },
      }),
    );
  }

  test('test mode: GET /audit-events returns only TEST events (no live leak) [Codex P1]', async () => {
    const { app, eventStore } = buildPersistentApp({ dataMode: 'test' });
    seedAuditEvent(eventStore, { aggregateId: 'evt-test', isTestData: true });
    seedAuditEvent(eventStore, { aggregateId: 'evt-live', isTestData: false });

    const res = await request(app).get('/api/v2/finance/audit-events');
    assert.equal(res.status, 200);
    const aggIds = res.body.data.events.map((e) => e.aggregate_id);
    assert.ok(aggIds.includes('evt-test'), 'test event present in test mode');
    assert.ok(!aggIds.includes('evt-live'), 'live event must NOT leak into test mode');
  });

  test('live mode: GET /audit-events returns only LIVE events (no test leak) [Codex P1]', async () => {
    const { app, eventStore } = buildPersistentApp({ dataMode: 'live' });
    seedAuditEvent(eventStore, { aggregateId: 'evt-test', isTestData: true });
    seedAuditEvent(eventStore, { aggregateId: 'evt-live', isTestData: false });

    const res = await request(app).get('/api/v2/finance/audit-events');
    assert.equal(res.status, 200);
    const aggIds = res.body.data.events.map((e) => e.aggregate_id);
    assert.ok(aggIds.includes('evt-live'), 'live event present in live mode');
    assert.ok(!aggIds.includes('evt-test'), 'dormant test event must NOT leak into live mode');
  });

  test('GET /evidence-packs counts only the active-mode partition [Codex P1]', async () => {
    // Same durable stream (2 test + 1 live), built once in test mode and once in
    // live mode. The pack must reflect only the active partition.
    const testApp = buildPersistentApp({ dataMode: 'test' });
    seedAuditEvent(testApp.eventStore, { aggregateId: 'p-test-1', isTestData: true });
    seedAuditEvent(testApp.eventStore, { aggregateId: 'p-test-2', isTestData: true });
    seedAuditEvent(testApp.eventStore, { aggregateId: 'p-live-1', isTestData: false });
    const testRes = await request(testApp.app).get('/api/v2/finance/evidence-packs');
    assert.equal(testRes.status, 200);
    assert.equal(
      testRes.body.data.pack.artifact_count,
      2,
      'test-mode pack counts only the 2 test events',
    );

    const liveApp = buildPersistentApp({ dataMode: 'live' });
    seedAuditEvent(liveApp.eventStore, { aggregateId: 'p-test-1', isTestData: true });
    seedAuditEvent(liveApp.eventStore, { aggregateId: 'p-test-2', isTestData: true });
    seedAuditEvent(liveApp.eventStore, { aggregateId: 'p-live-1', isTestData: false });
    const liveRes = await request(liveApp.app).get('/api/v2/finance/evidence-packs');
    assert.equal(liveRes.status, 200);
    assert.equal(
      liveRes.body.data.pack.artifact_count,
      1,
      'live-mode pack counts only the 1 live event',
    );
  });

  // Codex PR #634 P1 — a persistent write FAILS CLOSED when the tenant's Test/Live
  // mode cannot be resolved, rather than silently stamping the wrong partition.
  test('a mutating write is refused (503) when the data mode cannot be resolved', async () => {
    const { app } = buildPersistentApp({
      getFinanceDataMode: async () => {
        throw new Error('supabase lookup failed');
      },
    });

    const res = await request(app)
      .post('/api/v2/finance/journal-drafts')
      .send({
        lines: [
          { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
          {
            account_name: 'Revenue',
            classification: 'Revenue',
            debit_cents: 0,
            credit_cents: 1000,
          },
        ],
      });

    assert.equal(res.status, 503, `expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'FINANCE_DATA_MODE_UNRESOLVED');
  });
});
