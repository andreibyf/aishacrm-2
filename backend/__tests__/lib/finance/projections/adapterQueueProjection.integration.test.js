/**
 * Slice 2D — adapter_queue projection integration proof.
 *
 * Drives the FULL producer → promoter → processor → projection lifecycle
 * end-to-end against:
 *   - the real `createFinanceDomainService` (Slice 1 + 2B `approveFinanceAction`
 *     promoter wire)
 *   - the real `createErpnextSandboxAdapter` (Slice 2A) with mocked
 *     `httpClient.post` only (NO network IO)
 *   - the real `runAdapterPollCycle` (Slice 2B processor)
 *   - the real `createAdapterQueueProjectionWorker` (Phase 2B-10 consumer,
 *     already-implemented, no projection-side change in Slice 2)
 *   - the real `createProjectionRunner` driving the worker
 *
 * Per Slice 2-0 design freeze §4.9 + §5.4: the projection is the existing
 * 2B-10 consumer; Slice 2 only adds the producer side. The integration test
 * proves that the producer/promoter/processor emissions reach the projection
 * with the correct envelope + payload shape, and that the projection moves
 * items between buckets per the §7 read-model contract.
 *
 * Hard boundaries asserted by this test file:
 *   - simulateDealWon emits NO sync_queued (draft pre-approval state).
 *   - sync_queued comes only from the promoter (approveFinanceAction).
 *   - sync_succeeded / sync_failed come only from the processor.
 *   - Journal stays at `pending_approval` (no auto-post — Phase 3-8 §5.7).
 *   - All adapter events use aggregate_type='adapter_job', aggregate_id=job.id.
 *   - No object_type / object_id drift.
 *   - Replaying the full event stream rebuilds the same projection.
 *   - Dispatching the same sync_queued event twice leaves exactly one queue
 *     item (no duplicates).
 *   - No live ERPNext / network call (httpClient.post is mocked).
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import createFinanceDomainService from '../../../../lib/finance/financeDomainService.js';
import createFinanceEventStore from '../../../../lib/finance/financeEventStore.js';
import { runAdapterPollCycle } from '../../../../lib/finance/adapterJobProcessor.js';
import { buildProviderPayload } from '../../../../lib/finance/accountingAdapters/providerPayloadBuilder.js';
import { createErpnextSandboxAdapter } from '../../../../lib/finance/accountingAdapters/erpnextSandboxAdapter.js';
import { createProjectionRunner } from '../../../../lib/finance/projections/projectionRunner.js';
import { createMemoryProjectionStoreProvider } from '../../../../lib/finance/projections/projectionStore.memory.js';
import {
  createAdapterQueueProjectionWorker,
  ADAPTER_QUEUE_PROJECTION_NAME,
} from '../../../../lib/finance/projections/adapterQueueProjection.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

/**
 * Wire up the complete Slice 2 producer → consumer chain against a single
 * shared event store. Returns the pieces the test needs to drive each step.
 *
 * - eventStore: the in-memory append-only finance event store; both the
 *   domain service (producer + promoter) and the processor write to it,
 *   and the projection runner reads from it via .replay(tenantId).
 * - service: real createFinanceDomainService; simulateDealWon writes the
 *   draft adapter_job + pending approval, approveFinanceAction promotes
 *   the linked adapter_job draft → queued and emits sync_queued via the
 *   promoter wire from `e66538f0` / `d671d816` / `1d2b41e6`.
 * - erpnextAdapter: real createErpnextSandboxAdapter with httpClient.post
 *   captured via the `httpCalls` array (no network IO).
 * - httpCalls: array recording every httpClient.post invocation.
 * - httpClient: assignable so individual tests can swap in a throwing
 *   variant to drive the sync_failed path.
 * - runner: real createProjectionRunner with the memory store provider.
 * - worker: real createAdapterQueueProjectionWorker (the Phase 2B-10
 *   consumer — Slice 2 makes no projection-side changes).
 * - storeProvider: kept for direct getProjection assertions.
 * - dispatchPending(): drains any events appended since the last call and
 *   dispatches each one through the runner. Lets tests step through the
 *   lifecycle and assert projection state at each checkpoint.
 * - bucketsOf(): convenience query for the {queued, running, failed,
 *   completed} read model for TENANT_ID.
 * - realBucket(): async snapshot of the live domain-service tenant bucket
 *   AFTER promotion. Returns the actual post-promotion adapter_job row
 *   (mutated in place by the promoter), so processor-stage tests consume
 *   the genuine producer/promoter output instead of rebuilding from the
 *   pre-promotion `simulateDealWon` clone. Pass straight to
 *   `runAdapterPollCycle({ bucket: await ctx.realBucket(), ... })`.
 */
function wireSlice2Chain({ httpClientOverride = null } = {}) {
  const eventStore = createFinanceEventStore();
  const service = createFinanceDomainService({ eventStore });

  const httpCalls = [];
  const defaultHttpClient = {
    post: async (path, body) => {
      httpCalls.push({ path, body });
      return { data: { name: `MOCK-${httpCalls.length}`, docstatus: 0 } };
    },
    get: async () => ({ data: {} }),
  };
  const httpClient = httpClientOverride || defaultHttpClient;

  const erpnextAdapter = createErpnextSandboxAdapter({
    baseUrl: 'https://sandbox.example.com',
    apiKey: 'test_key',
    apiSecret: 'test_secret',
    httpClient,
    sandboxAllowlist: ['sandbox.example.com'],
  });

  const storeProvider = createMemoryProjectionStoreProvider();
  const runner = createProjectionRunner({
    eventStore,
    storeProvider,
    retryBackoffMs: 0,
  });
  const worker = createAdapterQueueProjectionWorker();
  runner.register(worker);

  let lastDispatchedCount = 0;
  async function dispatchPending() {
    // The in-memory event store returns events in append order via .replay();
    // we walk the suffix added since the prior dispatch and forward each one.
    const all = eventStore.replay(TENANT_ID);
    const newOnes = all.slice(lastDispatchedCount);
    lastDispatchedCount = all.length;
    for (const evt of newOnes) {
      await runner.dispatch(evt);
    }
    return newOnes;
  }

  function bucketsOf() {
    return worker.getProjection(
      TENANT_ID,
      {},
      storeProvider.getLiveStore(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_ID),
    );
  }

  // Snapshot the real domain-service tenant bucket — including the
  // post-promotion adapter_job row that `approveFinanceAction()`'s promoter
  // mutated in place. Tests pass this snapshot to `runAdapterPollCycle()` so
  // the processor consumes the actual promoter output (correct payload,
  // attempts, status, aggregate_id, etc.), not a synthetic reconstruction
  // from the pre-promotion `simulateDealWon` clone. This is the honest
  // cross-stage handoff Slice 2D claims to prove (per Codex P2 review
  // 2026-05-25): if the promoter ever drops or rewrites a processor-critical
  // field, this proof catches it; the prior `{ ...sim.adapter_job, status:
  // 'queued' }` shape would have hidden such drift.
  async function realBucket() {
    return service.getState(TENANT_ID);
  }

  return {
    eventStore,
    service,
    erpnextAdapter,
    httpClient,
    httpCalls,
    runner,
    worker,
    storeProvider,
    dispatchPending,
    bucketsOf,
    realBucket,
  };
}

function adapterEventsOnly(events) {
  return events.filter((e) => e.event_type.startsWith('finance.adapter.'));
}

// ---------------------------------------------------------------------------
// Step-by-step lifecycle proof
// ---------------------------------------------------------------------------

test('LIFECYCLE: simulateDealWon writes draft adapter_job + emits NO sync_queued; projection materializes it in the draft bucket', async () => {
  const ctx = wireSlice2Chain();

  const sim = await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });

  assert.equal(sim.adapter_job.status, 'draft', 'pre-approval state per §4.1');

  // simulateDealWon's emitted events: finance.draft.created (or similar) +
  // finance.approval.requested (which carries the draft adapter_job snapshot).
  // Critically, NO finance.adapter.* event yet.
  const events = ctx.eventStore.replay(TENANT_ID);
  const adapterEvents = adapterEventsOnly(events);
  assert.equal(
    adapterEvents.length,
    0,
    'simulateDealWon must emit no finance.adapter.* events at draft creation',
  );

  // Dispatch the events that ARE there. Task 8b: adapter_queue now consumes
  // finance.approval.requested for its draft adapter_job snapshot, so the draft
  // materializes into the `draft` bucket BEFORE any sync event — matching the
  // in-memory domain service's listAdapterJobs. The non-draft buckets stay empty.
  await ctx.dispatchPending();

  const buckets = ctx.bucketsOf();
  assert.equal(buckets.draft.length, 1, 'draft adapter_job materialized in the draft bucket');
  assert.equal(buckets.draft[0].adapter_job_id, sim.adapter_job.id);
  assert.equal(buckets.draft[0].status, 'draft');
  assert.equal(buckets.queued.length, 0);
  assert.equal(buckets.running.length, 0);
  assert.equal(buckets.failed.length, 0);
  assert.equal(buckets.completed.length, 0);
});

test('LIFECYCLE: approveFinanceAction emits sync_queued via promoter; projection moves item to queued bucket', async () => {
  const ctx = wireSlice2Chain();

  const sim = await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });
  await ctx.dispatchPending(); // drain simulateDealWon's events (incl. the draft)

  // Task 8b: the draft adapter_job already materialized from
  // finance.approval.requested.
  assert.equal(ctx.bucketsOf().draft.length, 1, 'draft materialized before approval');

  // Approve — the promoter in approveFinanceAction emits exactly one
  // sync_queued event per linked adapter_job.
  const approveResult = await ctx.service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });
  assert.equal(approveResult.promoted_adapter_jobs.length, 1);

  // Drain the new events.
  const newEvents = await ctx.dispatchPending();
  const newAdapterEvents = adapterEventsOnly(newEvents);
  assert.equal(newAdapterEvents.length, 1, 'exactly one new finance.adapter.* event');
  assert.equal(
    newAdapterEvents[0].event_type,
    'finance.adapter.sync_queued',
    'promoter emits sync_queued (not sync_succeeded or sync_failed)',
  );

  // Track A envelope check: aggregate_type='adapter_job', aggregate_id=job.id.
  assert.equal(newAdapterEvents[0].aggregate_type, 'adapter_job');
  assert.equal(newAdapterEvents[0].aggregate_id, sim.adapter_job.id);

  // Projection now has the item in the 'queued' bucket — the §7 read model
  // contract from the design freeze.
  const buckets = ctx.bucketsOf();
  assert.equal(buckets.queued.length, 1, 'queued bucket has the promoted job');
  assert.equal(buckets.queued[0].adapter_job_id, sim.adapter_job.id);
  assert.equal(buckets.queued[0].status, 'queued');
  assert.equal(buckets.queued[0].provider, 'erpnext');
  assert.equal(buckets.queued[0].aggregate_type, 'journal_entry');
  assert.equal(buckets.queued[0].operation, 'push_draft');
  assert.equal(buckets.queued[0].mode, 'draft_only');
  assert.equal(buckets.draft.length, 0, 'draft → queued transition left no duplicate in draft');
  assert.equal(buckets.running.length, 0);
  assert.equal(buckets.failed.length, 0);
  assert.equal(buckets.completed.length, 0);
});

test('LIFECYCLE: runAdapterPollCycle (real ERPNext adapter) emits sync_succeeded; projection moves item to completed', async () => {
  const ctx = wireSlice2Chain();

  // Steps 1 + 2: producer + promoter
  const sim = await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });
  await ctx.service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });
  await ctx.dispatchPending();

  // Pre-condition: projection has 1 queued item, 0 elsewhere.
  let buckets = ctx.bucketsOf();
  assert.equal(buckets.queued.length, 1);
  assert.equal(buckets.completed.length, 0);

  // Step 3: processor claims the queued job, calls the REAL ERPNext
  // adapter (with mocked httpClient), emits sync_succeeded.
  // Feed the processor the LIVE post-promotion bucket — the actual
  // adapter_job row the promoter mutated in place, with every
  // processor-critical field (payload, attempts, status, aggregate_id,
  // provider, mode, operation) sourced from the real producer chain.
  // This is the honest 2B-promoter → 2B-processor handoff Slice 2D
  // exists to prove (Codex P2 re-review 2026-05-25).
  const result = await runAdapterPollCycle({
    bucket: await ctx.realBucket(),
    adapters: new Map([['erpnext', ctx.erpnextAdapter]]),
    tenantIds: [TENANT_ID],
    eventStore: ctx.eventStore,
    buildProviderPayload,
    providerWritesEnabled: true, // DI override — avoids racing on process.env
  });
  assert.equal(result.succeeded_count, 1);

  // The processor invoked the real adapter, which invoked httpClient.post.
  assert.equal(ctx.httpCalls.length, 1, 'real ERPNext adapter called httpClient.post once');
  assert.ok(
    ctx.httpCalls[0].path.includes('/api/resource/Journal%20Entry'),
    'POST hit the ERPNext Journal Entry endpoint',
  );
  assert.equal(ctx.httpCalls[0].body.doctype, 'Journal Entry');
  assert.equal(ctx.httpCalls[0].body.docstatus, 0);

  // Drain the new events. Exactly one finance.adapter.sync_succeeded.
  const newEvents = await ctx.dispatchPending();
  const newAdapterEvents = adapterEventsOnly(newEvents);
  assert.equal(newAdapterEvents.length, 1);
  assert.equal(newAdapterEvents[0].event_type, 'finance.adapter.sync_succeeded');
  assert.equal(newAdapterEvents[0].aggregate_type, 'adapter_job');
  assert.equal(newAdapterEvents[0].aggregate_id, sim.adapter_job.id);

  // Projection moved the item from 'queued' to 'completed'.
  buckets = ctx.bucketsOf();
  assert.equal(buckets.completed.length, 1, 'completed bucket has the job');
  assert.equal(buckets.completed[0].adapter_job_id, sim.adapter_job.id);
  assert.equal(buckets.completed[0].status, 'succeeded');
  assert.equal(buckets.queued.length, 0, 'queued bucket emptied');
  assert.equal(buckets.running.length, 0);
  assert.equal(buckets.failed.length, 0);

  // Journal stays at pending_approval — Phase 3-8 §5.7 contract preserved.
  const entries = ctx.service.listJournalEntries(TENANT_ID);
  const je = entries.find((e) => e.id === sim.journal_entry.id);
  assert.equal(je.status, 'pending_approval', 'journal NEVER auto-posted by Slice 2');
});

test('LIFECYCLE: runAdapterPollCycle (adapter throws permanent) emits sync_failed; projection moves item to failed', async () => {
  // Throwing httpClient — every adapter call fails.
  const ctx = wireSlice2Chain({
    httpClientOverride: {
      post: async () => {
        throw new Error('simulated ERPNext outage');
      },
      get: async () => ({ data: {} }),
    },
  });

  const sim = await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });
  await ctx.service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });
  await ctx.dispatchPending();

  // Take the LIVE post-promotion bucket (real promoter output) and patch
  // ONLY `attempts=4` on the real row — one field below the default
  // max_attempts=5 so the impending failure tips into permanent. Every
  // other processor-critical field (payload, status, provider, mode,
  // aggregate_id, ...) still comes from the genuine promoter mutation,
  // preserving the cross-stage handoff this proof requires.
  const processBucket = await ctx.realBucket();
  const queuedRow = processBucket.adapterJobs.find((j) => j.id === sim.adapter_job.id);
  assert.ok(queuedRow, 'real bucket contains the post-promotion adapter_job');
  assert.equal(queuedRow.status, 'queued', 'promoter mutated the real row to queued');
  queuedRow.attempts = 4; // force terminal on first failure (max_attempts=5)
  const result = await runAdapterPollCycle({
    bucket: processBucket,
    adapters: new Map([['erpnext', ctx.erpnextAdapter]]),
    tenantIds: [TENANT_ID],
    eventStore: ctx.eventStore,
    buildProviderPayload,
    providerWritesEnabled: true,
  });
  assert.equal(result.failed_count, 1);
  assert.equal(result.summary[0].permanent, true, 'terminal at attempts=5 == max');

  const newAdapterEvents = adapterEventsOnly(await ctx.dispatchPending());
  assert.equal(newAdapterEvents.length, 1);
  assert.equal(newAdapterEvents[0].event_type, 'finance.adapter.sync_failed');
  assert.equal(newAdapterEvents[0].payload.permanent, true);

  const buckets = ctx.bucketsOf();
  assert.equal(buckets.failed.length, 1, 'failed bucket has the job');
  assert.equal(buckets.failed[0].adapter_job_id, sim.adapter_job.id);
  assert.equal(buckets.failed[0].status, 'failed');
  assert.equal(buckets.completed.length, 0);
  assert.equal(buckets.queued.length, 0);
});

// ---------------------------------------------------------------------------
// Producer-split assertions (the test the prior end-to-end was missing)
// ---------------------------------------------------------------------------

test('PRODUCER SPLIT: across the full lifecycle, sync_queued comes only from the promoter; sync_succeeded/sync_failed only from the processor', async () => {
  const ctx = wireSlice2Chain();

  // Mark the event-store length BEFORE each emit-causing call so we can
  // attribute each adapter event to its producer.
  const stage1Start = ctx.eventStore.replay(TENANT_ID).length;
  const sim = await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });
  const afterSimulate = ctx.eventStore.replay(TENANT_ID).slice(stage1Start);
  assert.equal(
    adapterEventsOnly(afterSimulate).length,
    0,
    'simulateDealWon emits ZERO finance.adapter.* events',
  );

  const stage2Start = ctx.eventStore.replay(TENANT_ID).length;
  await ctx.service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });
  const afterApprove = ctx.eventStore.replay(TENANT_ID).slice(stage2Start);
  const promoterEmissions = adapterEventsOnly(afterApprove);
  assert.equal(promoterEmissions.length, 1, 'promoter emits exactly one finance.adapter.* event');
  assert.equal(
    promoterEmissions[0].event_type,
    'finance.adapter.sync_queued',
    'promoter only emits sync_queued — never sync_succeeded/sync_failed',
  );

  const stage3Start = ctx.eventStore.replay(TENANT_ID).length;
  await runAdapterPollCycle({
    bucket: await ctx.realBucket(),
    adapters: new Map([['erpnext', ctx.erpnextAdapter]]),
    tenantIds: [TENANT_ID],
    eventStore: ctx.eventStore,
    buildProviderPayload,
    providerWritesEnabled: true,
  });
  const afterProcess = ctx.eventStore.replay(TENANT_ID).slice(stage3Start);
  const processorEmissions = adapterEventsOnly(afterProcess);
  assert.equal(processorEmissions.length, 1, 'processor emits exactly one finance.adapter.* event');
  assert.ok(
    ['finance.adapter.sync_succeeded', 'finance.adapter.sync_failed'].includes(
      processorEmissions[0].event_type,
    ),
    `processor only emits sync_succeeded/sync_failed (got ${processorEmissions[0].event_type})`,
  );
  assert.notEqual(
    processorEmissions[0].event_type,
    'finance.adapter.sync_queued',
    'processor NEVER emits sync_queued — that is exclusively the promoter',
  );
});

// ---------------------------------------------------------------------------
// Envelope invariants — Track A vocabulary, no object_type / object_id drift
// ---------------------------------------------------------------------------

test('ENVELOPE: every finance.adapter.* event uses aggregate_type=adapter_job, aggregate_id=job.id, with NO object_type/object_id drift', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    const ctx = wireSlice2Chain();

    const sim = await ctx.service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { provider: 'erpnext', amount_cents: 12345 },
    });
    await ctx.service.approveFinanceAction({
      tenantId: TENANT_ID,
      approvalId: sim.approval.id,
      actor: { id: 'approver-1', type: 'human' },
    });
    await runAdapterPollCycle({
      bucket: await ctx.realBucket(),
      adapters: new Map([['erpnext', ctx.erpnextAdapter]]),
      tenantIds: [TENANT_ID],
      eventStore: ctx.eventStore,
      buildProviderPayload,
    });

    const adapterEvents = adapterEventsOnly(ctx.eventStore.replay(TENANT_ID));
    assert.equal(adapterEvents.length, 2, 'lifecycle: 1 sync_queued + 1 sync_succeeded');

    for (const evt of adapterEvents) {
      // Track A envelope contract
      assert.equal(evt.aggregate_type, 'adapter_job', `${evt.event_type} envelope aggregate_type`);
      assert.equal(evt.aggregate_id, sim.adapter_job.id, `${evt.event_type} envelope aggregate_id`);

      // NO object_type / object_id drift at envelope OR payload level
      assert.ok(!('object_type' in evt), `${evt.event_type} envelope must not carry object_type`);
      assert.ok(!('object_id' in evt), `${evt.event_type} envelope must not carry object_id`);

      // Embedded adapter_job snapshot per Phase 2B-10 §3 contract
      assert.ok(evt.payload?.adapter_job, `${evt.event_type} payload carries adapter_job snapshot`);
      assert.equal(evt.payload.adapter_job.id, sim.adapter_job.id);
      assert.equal(evt.payload.adapter_job.aggregate_type, 'journal_entry');
    }
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

// ---------------------------------------------------------------------------
// Replay determinism — the projection rebuilds byte-identically from the
// event stream alone. This is the §4.9 "replay parity" obligation in the
// Slice 2-0 design freeze.
// ---------------------------------------------------------------------------

test('REPLAY: rebuilding from the event stream produces the same projection state', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    const ctx = wireSlice2Chain();

    // Drive the full happy path.
    const sim = await ctx.service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { provider: 'erpnext', amount_cents: 12345 },
    });
    await ctx.service.approveFinanceAction({
      tenantId: TENANT_ID,
      approvalId: sim.approval.id,
      actor: { id: 'approver-1', type: 'human' },
    });
    await runAdapterPollCycle({
      bucket: await ctx.realBucket(),
      adapters: new Map([['erpnext', ctx.erpnextAdapter]]),
      tenantIds: [TENANT_ID],
      eventStore: ctx.eventStore,
      buildProviderPayload,
    });
    await ctx.dispatchPending();

    const beforeReplay = ctx.bucketsOf();
    const beforeSerialized = JSON.stringify(beforeReplay);

    // Replay the full event stream — wipes and rebuilds the projection from
    // facts alone. The state must match what dispatch produced.
    await ctx.runner.replay(ADAPTER_QUEUE_PROJECTION_NAME, TENANT_ID);

    const afterReplay = ctx.bucketsOf();
    const afterSerialized = JSON.stringify(afterReplay);

    assert.equal(
      afterSerialized,
      beforeSerialized,
      'replay must rebuild the projection byte-identically (replay determinism per §4.9)',
    );
    assert.equal(afterReplay.completed.length, 1);
    assert.equal(afterReplay.queued.length, 0);
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('REPLAY: re-dispatching the same sync_queued event leaves exactly one queue item (no duplicates per §4.9)', async () => {
  const ctx = wireSlice2Chain();

  const sim = await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });
  await ctx.service.approveFinanceAction({
    tenantId: TENANT_ID,
    approvalId: sim.approval.id,
    actor: { id: 'approver-1', type: 'human' },
  });
  await ctx.dispatchPending();

  assert.equal(ctx.bucketsOf().queued.length, 1, 'baseline: one queued item');

  // Re-dispatch the exact same sync_queued event. The projection stores
  // keyed by adapter_job_id, so the second event is an idempotent upsert
  // (per the adapter_queue projection's "one active queue item per
  // adapter_job_id per tenant" structural invariant).
  const allEvents = ctx.eventStore.replay(TENANT_ID);
  const syncQueued = allEvents.find((e) => e.event_type === 'finance.adapter.sync_queued');
  assert.ok(syncQueued, 'sync_queued exists in event stream');

  await ctx.runner.dispatch(syncQueued);

  assert.equal(ctx.bucketsOf().queued.length, 1, 'still exactly one queue item after re-dispatch');
});

// ---------------------------------------------------------------------------
// Safety boundary — provider writes stay gated even when reachable
// ---------------------------------------------------------------------------

test('SAFETY: with FINANCE_PROVIDER_WRITES_ENABLED=false (default), processor records dry-run succeeded without calling httpClient.post', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  delete process.env.FINANCE_PROVIDER_WRITES_ENABLED; // default = disabled

  try {
    const ctx = wireSlice2Chain();

    const sim = await ctx.service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { provider: 'erpnext', amount_cents: 12345 },
    });
    await ctx.service.approveFinanceAction({
      tenantId: TENANT_ID,
      approvalId: sim.approval.id,
      actor: { id: 'approver-1', type: 'human' },
    });
    await ctx.dispatchPending();

    const result = await runAdapterPollCycle({
      bucket: await ctx.realBucket(),
      adapters: new Map([['erpnext', ctx.erpnextAdapter]]),
      tenantIds: [TENANT_ID],
      eventStore: ctx.eventStore,
      buildProviderPayload,
    });
    await ctx.dispatchPending();

    assert.equal(result.succeeded_count, 1);
    assert.equal(result.summary[0].dry_run, true, 'kill switch produced a dry-run outcome');
    assert.equal(ctx.httpCalls.length, 0, 'NO httpClient.post call — provider was skipped');

    const buckets = ctx.bucketsOf();
    assert.equal(buckets.completed.length, 1, 'projection still records completion');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

// ---------------------------------------------------------------------------
// Projection scope check — consumes the canonical finance.adapter.sync_* events
// plus finance.approval.requested (Task 8b: for its draft adapter_job snapshot).
// Other event types are silently skipped by the runner per the dispatch filter,
// NOT degraded.
// ---------------------------------------------------------------------------

test('PROJECTION SCOPE: a non-consumed event flowing through the runner is ignored by adapter_queue', async () => {
  const ctx = wireSlice2Chain();

  // simulateDealWon emits finance.approval.requested, which adapter_queue NOW
  // consumes (Task 8b) — it materializes the draft adapter_job.
  await ctx.service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { provider: 'erpnext', amount_cents: 12345 },
  });
  await ctx.dispatchPending();

  let buckets = ctx.bucketsOf();
  assert.equal(buckets.draft.length, 1, 'finance.approval.requested materialized the draft');
  assert.equal(buckets.queued.length, 0);
  assert.equal(buckets.completed.length, 0);
  assert.equal(buckets.failed.length, 0);
  assert.equal(
    buckets.running.length,
    0,
    'running bucket stays empty — no in-flight event canonicalized yet',
  );

  // A genuinely non-consumed event (finance.journal.posted is NOT in this
  // worker's CONSUMED_EVENTS) is skipped by the runner's dispatch filter,
  // leaving the read model unchanged — never degraded.
  await ctx.runner.dispatch({
    id: 'jp-scope-1',
    tenant_id: TENANT_ID,
    event_type: 'finance.journal.posted',
    created_at: '2026-05-21T05:00:00.000Z',
    payload: {},
  });

  buckets = ctx.bucketsOf();
  assert.equal(buckets.draft.length, 1, 'non-consumed event did not touch the read model');
  assert.equal(buckets.queued.length, 0);
  assert.equal(buckets.completed.length, 0);
  assert.equal(buckets.failed.length, 0);
  assert.equal(buckets.running.length, 0);
});
