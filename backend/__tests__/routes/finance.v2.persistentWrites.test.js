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

  // Codex PR #650 P2 — /cash-flow reads the journal_entries PROJECTION unfiltered
  // by partition (only the COA fold honors isTestData), so it must fail CLOSED on an
  // unresolved data mode rather than fail-safe-to-test (which would pair a test COA
  // with possibly-live entries and leak live cash movements under a test label).
  test('GET /cash-flow is refused (503) when the data mode cannot be resolved', async () => {
    const { app } = buildPersistentApp({
      getFinanceDataMode: async () => {
        throw new Error('supabase lookup failed');
      },
    });

    const res = await request(app).get('/api/v2/finance/cash-flow');

    assert.equal(res.status, 503, `expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'FINANCE_DATA_MODE_UNRESOLVED');
  });

  // Codex PR #651 P2 — /accounts also fails closed: has_posted_history is derived from
  // the unpartitioned journal_entries projection, so a fail-safe-to-test guess could
  // leak a live activity bit / wrongly lock test edits.
  test('GET /accounts is refused (503) when the data mode cannot be resolved', async () => {
    const { app } = buildPersistentApp({
      getFinanceDataMode: async () => {
        throw new Error('supabase lookup failed');
      },
    });

    const res = await request(app).get('/api/v2/finance/accounts');

    assert.equal(res.status, 503, `expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'FINANCE_DATA_MODE_UNRESOLVED');
  });

  // Codex PR #650 P1 — the posted-deal SANDBOX is server-enforced test-only.
  test('POST /simulate/posted-deal-won is refused (409) for a LIVE persistent tenant', async () => {
    const { app, eventStore } = buildPersistentApp({ dataMode: 'live' });
    const res = await request(app)
      .post('/api/v2/finance/simulate/posted-deal-won')
      .send({ amount_cents: 250000, currency: 'usd' });
    assert.equal(res.status, 409, JSON.stringify(res.body));
    assert.equal(res.body.code, 'FINANCE_TEST_MODE_REQUIRED');
    const events = await eventStore.query({ tenant_id: TENANT_ID });
    assert.equal(events.length, 0, 'the command must not run / no events appended in live mode');
  });

  // Codex PR #650 P2 — the sandbox write is BOUND to the verified test partition,
  // so a test→live flip between the guard check and the write cannot persist live.
  test('POST /simulate/posted-deal-won stamps TEST even if the mode flips to live mid-request', async () => {
    let call = 0;
    // 'test' at the guard check (call 1); 'live' on any later resolution (the flip)
    const getFinanceDataMode = async () => (++call === 1 ? 'test' : 'live');
    const { app, eventStore } = buildPersistentApp({ getFinanceDataMode });
    const res = await request(app)
      .post('/api/v2/finance/simulate/posted-deal-won')
      .send({ amount_cents: 250000, currency: 'usd' });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const events = await eventStore.query({ tenant_id: TENANT_ID });
    assert.ok(events.length > 0, 'the sandbox write appended events');
    assert.ok(
      events.every((e) => e.is_test_data === true),
      'sandbox write bound to the verified TEST partition (not re-resolved to live)',
    );
  });

  // -------------------------------------------------------------------------
  // Editable COA manager — Task 15 (design §7 partition behavior). A COA
  // POST /accounts is a partition-stamped write exactly like the other
  // mutations: in TEST mode it stamps is_test_data=true and folds only into the
  // test partition's chart; LIVE keeps its own independent chart; and an
  // unresolved data mode fails closed (503) so a COA edit never lands in the
  // wrong partition.
  // -------------------------------------------------------------------------

  // Build an app over CALLER-SUPPLIED shared stores so a single durable event
  // store can be read under both the TEST and the LIVE partition (proving
  // cross-partition isolation). Mirrors buildPersistentApp's wiring.
  function buildPersistentAppOverStores({ eventStore, storeProvider, dataMode }) {
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: 'human-user-1', role: 'admin', tenant_id: TENANT_ID, tenant_uuid: TENANT_ID };
      next();
    });
    app.use(
      '/api/v2/finance',
      createFinanceV2Routes(DUMMY_POOL, {
        isFinanceModuleEnabled: async () => true,
        eventStore,
        createStoreProvider: () => storeProvider,
        getFinanceDataMode: async () => dataMode,
      }),
    );
    return app;
  }

  const COA_PAYLOAD = { name: 'Operating Bank', classification: 'Asset', account_type: 'Bank' };

  test('a COA POST /accounts in TEST mode stamps is_test_data=true and folds only into the test partition', async () => {
    const { app, eventStore } = buildPersistentApp({ dataMode: 'test' });

    const createRes = await request(app).post('/api/v2/finance/accounts').send(COA_PAYLOAD);
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const createdId = createRes.body.data.id;
    assert.ok(createdId, 'created account has an id');

    // The emitted finance.account.created envelope is partition-stamped TEST.
    const events = await eventStore.query({ tenant_id: TENANT_ID });
    const created = events.filter((e) => e.event_type === 'finance.account.created');
    assert.ok(created.length > 0, 'a finance.account.created event was appended');
    assert.ok(
      created.every((e) => e.is_test_data === true),
      'the COA create is stamped into the TEST partition',
    );

    // Read-your-write within the SAME (test) partition: the new account is in the
    // test chart. (The /accounts read contract returns { accounts } with no
    // `source` provenance block — read-route parity with read-routes.test.js —
    // so the read-your-write visibility below is the partition signal.)
    const testList = await request(app).get('/api/v2/finance/accounts');
    assert.equal(testList.status, 200);
    assert.ok(
      testList.body.data.accounts.some((a) => a.id === createdId),
      'test-created account is visible in the test chart',
    );
  });

  test('GET /accounts for the LIVE partition does NOT show a TEST-created account', async () => {
    // Share ONE durable store + projection provider across a TEST-mode write app
    // and a LIVE-mode read app so the only difference is the active partition.
    const eventStore = createFinanceEventStore();
    const storeProvider = createMemoryProjectionStoreProvider();

    const testApp = buildPersistentAppOverStores({ eventStore, storeProvider, dataMode: 'test' });
    const liveApp = buildPersistentAppOverStores({ eventStore, storeProvider, dataMode: 'live' });

    const createRes = await request(testApp).post('/api/v2/finance/accounts').send(COA_PAYLOAD);
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const createdId = createRes.body.data.id;

    // The test partition sees it...
    const testList = await request(testApp).get('/api/v2/finance/accounts');
    assert.ok(
      testList.body.data.accounts.some((a) => a.id === createdId),
      'test chart shows the test-created account',
    );

    // ...but the LIVE partition's chart must NOT — only the re-seeded baseline
    // system accounts (no test-created account leaks across the partition).
    const liveList = await request(liveApp).get('/api/v2/finance/accounts');
    assert.equal(liveList.status, 200);
    assert.ok(
      !liveList.body.data.accounts.some((a) => a.id === createdId),
      `test-created account ${createdId} must NOT appear in the live chart; got ${JSON.stringify(
        liveList.body.data.accounts.map((a) => a.id),
      )}`,
    );
  });

  test('a COA POST /accounts is refused (503) when the data mode cannot be resolved', async () => {
    const { app } = buildPersistentApp({
      getFinanceDataMode: async () => {
        throw new Error('supabase lookup failed');
      },
    });
    const res = await request(app).post('/api/v2/finance/accounts').send(COA_PAYLOAD);
    assert.equal(res.status, 503, `expected 503, got ${res.status}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.code, 'FINANCE_DATA_MODE_UNRESOLVED');
  });

  // -------------------------------------------------------------------------
  // Editable COA manager — Phase 4 (design §8 + §9). The PERSISTENT read path's
  // chart fold must reflect account EDITS and DEACTIVATIONS, not just creates.
  // A renamed/retyped account folded from `finance.account.created` alone would
  // read back with its ORIGINAL fields; a deactivated account would never hide.
  // These prove GET /accounts (via the projection-backed read adapter) folds
  // `finance.account.updated` (full-snapshot replace) and `finance.account.deactivated`
  // (is_active flip) end-to-end — the same semantics financeDomainReplay.js folds.
  // -------------------------------------------------------------------------

  test('GET /accounts reflects a PATCH edit (new name + account_type) in persistent mode', async () => {
    const { app } = buildPersistentApp({ dataMode: 'test' });

    const createRes = await request(app).post('/api/v2/finance/accounts').send(COA_PAYLOAD);
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const id = createRes.body.data.id;
    assert.ok(id, 'created account has an id');

    // Edit: rename AND retype (Asset/Bank → keep Asset classification but change
    // name + account_type). updateAccount emits finance.account.updated with the
    // FULL post-edit snapshot under payload.account.
    const patchRes = await request(app)
      .patch(`/api/v2/finance/accounts/${id}`)
      .send({ name: 'Renamed Settlement Bank', account_type: 'Cash', reason: 'reclassified' });
    assert.equal(patchRes.status, 200, JSON.stringify(patchRes.body));

    const listRes = await request(app).get('/api/v2/finance/accounts');
    assert.equal(listRes.status, 200);
    const acc = listRes.body.data.accounts.find((a) => a.id === id);
    assert.ok(acc, `edited account ${id} should be visible; got ${JSON.stringify(
      listRes.body.data.accounts.map((a) => a.id),
    )}`);
    assert.equal(acc.name, 'Renamed Settlement Bank', 'GET /accounts reflects the NEW name');
    assert.equal(acc.account_type, 'Cash', 'GET /accounts reflects the NEW account_type');
    assert.equal(acc.is_active, true, 'an edited (not deactivated) account stays active');
  });

  test('GET /accounts hides a deactivated account (is_active:false) in persistent mode', async () => {
    const { app } = buildPersistentApp({ dataMode: 'test' });

    const createRes = await request(app).post('/api/v2/finance/accounts').send(COA_PAYLOAD);
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const id = createRes.body.data.id;

    const deacRes = await request(app)
      .post(`/api/v2/finance/accounts/${id}/deactivate`)
      .send({ reason: 'closing the account' });
    assert.equal(deacRes.status, 200, JSON.stringify(deacRes.body));

    const listRes = await request(app).get('/api/v2/finance/accounts');
    assert.equal(listRes.status, 200);
    const acc = listRes.body.data.accounts.find((a) => a.id === id);
    assert.ok(acc, `deactivated account ${id} should still be present in the chart`);
    assert.equal(
      acc.is_active,
      false,
      `deactivated account must read back is_active:false; got ${JSON.stringify(acc)}`,
    );
  });

  // Editable COA manager — Phase 4 ORDERING bug. A create → deactivate →
  // reactivate sequence appends events in this GLOBAL order:
  //   1. finance.account.created     (is_active:true)
  //   2. finance.account.deactivated (flip is_active:false)
  //   3. finance.account.updated     (reactivation snapshot, is_active:true)
  // The correct final state is is_active:true. A per-event-TYPE fold (created →
  // updated → deactivated passes) loses this global append order: the
  // reactivation (updated) is folded BEFORE the deactivation, so the later
  // deactivated pass re-flips it off and GET /accounts wrongly reads
  // is_active:false. This asserts the single ORDERED pass yields is_active:true.
  test('GET /accounts reflects a create→deactivate→reactivate sequence as is_active:true (ordered fold)', async () => {
    const { app } = buildPersistentApp({ dataMode: 'test' });

    const createRes = await request(app).post('/api/v2/finance/accounts').send(COA_PAYLOAD);
    assert.equal(createRes.status, 201, JSON.stringify(createRes.body));
    const id = createRes.body.data.id;
    assert.ok(id, 'created account has an id');

    const deacRes = await request(app)
      .post(`/api/v2/finance/accounts/${id}/deactivate`)
      .send({ reason: 'temporarily closing' });
    assert.equal(deacRes.status, 200, JSON.stringify(deacRes.body));

    const reacRes = await request(app)
      .post(`/api/v2/finance/accounts/${id}/reactivate`)
      .send({ reason: 'reopening' });
    assert.equal(reacRes.status, 200, JSON.stringify(reacRes.body));

    const listRes = await request(app).get('/api/v2/finance/accounts');
    assert.equal(listRes.status, 200);
    const acc = listRes.body.data.accounts.find((a) => a.id === id);
    assert.ok(acc, `reactivated account ${id} should be present in the chart`);
    assert.equal(
      acc.is_active,
      true,
      `a reactivated account must read back is_active:true (ordered fold); got ${JSON.stringify(
        acc,
      )}`,
    );
  });
});
