import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runAdapterPollCycle,
  assertWritePermitted,
  AdapterPermissionError,
  AdapterCapabilityError,
  computeBackoffMs,
} from '../../../lib/finance/adapterJobProcessor.js';
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

function makeQueuedJob(overrides = {}) {
  return {
    id: 'adapter_job_proc_1',
    tenant_id: TENANT_ID,
    status: 'queued',
    provider: 'erpnext',
    aggregate_type: 'journal_entry',
    aggregate_id: 'je_proc_1',
    operation: 'push_draft',
    mode: 'draft_only',
    attempts: 0,
    payload: { foo: 'bar' },
    created_at: '2026-05-24T00:00:00.000Z',
    updated_at: '2026-05-24T00:00:00.000Z',
    ...overrides,
  };
}

function makeAdapter(overrides = {}) {
  return {
    pushDraft: async () => ({ provider_id: 'JE-DRAFT-001' }),
    pushFinal: async () => {
      throw new AdapterCapabilityError('pushFinal not supported in draft mode');
    },
    voidRecord: async () => {
      throw new AdapterCapabilityError('voidRecord not supported');
    },
    pullStatus: async () => ({ status: 'open' }),
    reconcile: async () => ({ drift: [] }),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// assertWritePermitted — code-side gate per §4.6 behavior matrix
// ---------------------------------------------------------------------------

test('assertWritePermitted: push_draft is allowed in every mode', () => {
  for (const mode of ['draft_only', 'sandbox_full', 'production']) {
    assert.doesNotThrow(() => assertWritePermitted('push_draft', mode));
  }
});

test('assertWritePermitted: push_final + draft_only throws', () => {
  assert.throws(
    () => assertWritePermitted('push_final', 'draft_only'),
    (err) => err instanceof AdapterPermissionError && /draft_only/.test(err.message),
  );
});

test('assertWritePermitted: void_record + draft_only throws', () => {
  assert.throws(
    () => assertWritePermitted('void_record', 'draft_only'),
    (err) => err instanceof AdapterPermissionError,
  );
});

test('assertWritePermitted: read operations allowed in all modes', () => {
  for (const op of ['pull_status', 'sync_status', 'reconcile']) {
    for (const mode of ['draft_only', 'sandbox_full', 'production']) {
      assert.doesNotThrow(() => assertWritePermitted(op, mode));
    }
  }
});

test('assertWritePermitted: unknown operation throws', () => {
  assert.throws(
    () => assertWritePermitted('bogus_op', 'draft_only'),
    (err) => err instanceof AdapterPermissionError && /Unknown/.test(err.message),
  );
});

// ---------------------------------------------------------------------------
// computeBackoffMs — §4.8 exponential backoff
// ---------------------------------------------------------------------------

test('computeBackoffMs: grows exponentially up to cap', () => {
  const baseMs = 1000;
  const capMs = 60000;
  const det0 = { random: () => 0 };
  const b1 = computeBackoffMs(0, { baseMs, capMs, jitterMs: 0, ...det0 });
  const b2 = computeBackoffMs(1, { baseMs, capMs, jitterMs: 0, ...det0 });
  const b3 = computeBackoffMs(2, { baseMs, capMs, jitterMs: 0, ...det0 });
  const b10 = computeBackoffMs(10, { baseMs, capMs, jitterMs: 0, ...det0 });
  assert.equal(b1, 1000); // 2^0 * 1000 = 1000
  assert.equal(b2, 2000); // 2^1 * 1000 = 2000
  assert.equal(b3, 4000); // 2^2 * 1000 = 4000
  assert.equal(b10, capMs); // capped
});

test('computeBackoffMs: applies jitter from injected random', () => {
  const v = computeBackoffMs(0, {
    baseMs: 1000,
    capMs: 60000,
    jitterMs: 5000,
    random: () => 0.5,
  });
  assert.equal(v, 1000 + 2500);
});

// ---------------------------------------------------------------------------
// runAdapterPollCycle — in-memory mode, basic claim + dry-run succeed path
// ---------------------------------------------------------------------------

test('runAdapterPollCycle: requires eventStore.append', async () => {
  await assert.rejects(
    () =>
      runAdapterPollCycle({ bucket: makeBucket(), adapters: new Map(), tenantIds: [TENANT_ID] }),
    /eventStore\.append is required/i,
  );
});

test('runAdapterPollCycle: rejects when both pool and bucket are passed', async () => {
  await assert.rejects(
    () =>
      runAdapterPollCycle({
        pool: { connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }) },
        bucket: makeBucket(),
        adapters: new Map(),
        tenantIds: [TENANT_ID],
        eventStore: { append: async () => {} },
      }),
    /pass either `pool` or `bucket`, not both/i,
  );
});

test('runAdapterPollCycle in-memory: no queued jobs → no-op', async () => {
  const bucket = makeBucket([]);
  const eventStore = createFinanceEventStore();
  const result = await runAdapterPollCycle({
    bucket,
    adapters: new Map([['erpnext', makeAdapter()]]),
    tenantIds: [TENANT_ID],
    eventStore,
  });
  assert.equal(result.claimed_count, 0);
  assert.equal(result.succeeded_count, 0);
  assert.equal(result.failed_count, 0);
  assert.equal(result.summary.length, 0);
});

test('runAdapterPollCycle in-memory: tenantIds=[] → no-op (no implicit all-tenants)', async () => {
  const job = makeQueuedJob();
  const bucket = makeBucket([job]);
  const eventStore = createFinanceEventStore();
  const result = await runAdapterPollCycle({
    bucket,
    adapters: new Map([['erpnext', makeAdapter()]]),
    tenantIds: [],
    eventStore,
  });
  assert.equal(result.claimed_count, 0);
  assert.equal(job.status, 'queued', 'job untouched');
});

test('runAdapterPollCycle in-memory: claims queued job, marks succeeded (dry-run when writes disabled), emits sync_succeeded', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'false';

  try {
    const job = makeQueuedJob();
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', makeAdapter()]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });

    assert.equal(result.claimed_count, 1);
    assert.equal(result.succeeded_count, 1);
    assert.equal(job.status, 'succeeded');
    assert.equal(job.attempts, 1);
    assert.equal(result.summary[0].outcome, 'succeeded');
    assert.equal(result.summary[0].dry_run, true);

    const events = eventStore.replay(TENANT_ID);
    assert.equal(events.length, 1);
    assert.equal(events[0].event_type, 'finance.adapter.sync_succeeded');
    assert.equal(events[0].aggregate_type, 'adapter_job');
    assert.equal(events[0].aggregate_id, job.id);
    assert.equal(events[0].payload.provider_id, null, 'dry run → null provider_id');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: NEVER claims draft jobs', async () => {
  let pushDraftCalled = false;
  const draftJob = makeQueuedJob({ status: 'draft' });
  const bucket = makeBucket([draftJob]);
  const eventStore = createFinanceEventStore();
  const result = await runAdapterPollCycle({
    bucket,
    adapters: new Map([
      [
        'erpnext',
        makeAdapter({
          pushDraft: async () => {
            pushDraftCalled = true;
            return { provider_id: 'X' };
          },
        }),
      ],
    ]),
    tenantIds: [TENANT_ID],
    eventStore,
  });
  assert.equal(result.claimed_count, 0, 'draft jobs are not claimable');
  assert.equal(draftJob.status, 'draft', 'draft job unchanged');
  assert.equal(pushDraftCalled, false, 'adapter never invoked');
  assert.equal(eventStore.replay(TENANT_ID).length, 0, 'no sync_succeeded emitted');
});

test('runAdapterPollCycle in-memory: NEVER emits sync_queued (that is the promoter only, per §4.7)', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'false';
  try {
    const job = makeQueuedJob();
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', makeAdapter()]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });
    const events = eventStore.replay(TENANT_ID);
    const queuedEvents = events.filter((e) => e.event_type === 'finance.adapter.sync_queued');
    assert.equal(queuedEvents.length, 0, 'processor never emits sync_queued');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: skips when no adapter registered for provider; requeues job without consuming attempt', async () => {
  const job = makeQueuedJob({ provider: 'unknown_provider' });
  const bucket = makeBucket([job]);
  const eventStore = createFinanceEventStore();
  const result = await runAdapterPollCycle({
    bucket,
    adapters: new Map([['erpnext', makeAdapter()]]), // no 'unknown_provider'
    tenantIds: [TENANT_ID],
    eventStore,
  });
  assert.equal(result.skipped_count, 1);
  assert.equal(job.status, 'queued', 'job requeued');
  assert.equal(job.attempts, 0, 'attempt not consumed');
  assert.equal(eventStore.replay(TENANT_ID).length, 0, 'no event emitted for skip');
});

test('runAdapterPollCycle in-memory: invokes adapter and emits sync_succeeded with provider_id when writes enabled', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    let adapterCalled = false;
    const adapter = makeAdapter({
      pushDraft: async (_payload, ctx) => {
        adapterCalled = true;
        // Processor maps aggregate_type='journal_entry' (Track A vocabulary)
        // → objectType='JournalEntry' (provider object-type vocabulary,
        // per AGGREGATE_TYPE_TO_OBJECT_TYPE in adapterJobProcessor.js).
        assert.equal(ctx.objectType, 'JournalEntry');
        assert.equal(ctx.runtimePolicy.provider, 'erpnext');
        assert.equal(ctx.runtimePolicy.mode, 'draft_only');
        assert.equal(ctx.tenantId, TENANT_ID);
        return { provider_id: 'ERPNEXT-JE-123' };
      },
    });
    const job = makeQueuedJob();
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', adapter]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });
    assert.equal(adapterCalled, true);
    assert.equal(result.succeeded_count, 1);
    const events = eventStore.replay(TENANT_ID);
    assert.equal(events[0].payload.provider_id, 'ERPNEXT-JE-123');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: AdapterCapabilityError is a PERMANENT failure (no retry)', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    const adapter = makeAdapter({
      pushDraft: async () => {
        throw new AdapterCapabilityError('cannot do that');
      },
    });
    const job = makeQueuedJob();
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', adapter]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });
    assert.equal(result.failed_count, 1);
    assert.equal(result.summary[0].permanent, true);
    assert.equal(job.status, 'failed');
    const events = eventStore.replay(TENANT_ID);
    assert.equal(events[0].event_type, 'finance.adapter.sync_failed');
    assert.equal(events[0].payload.permanent, true);
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: transient adapter error requeues with next_attempt_at (not permanent)', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    const adapter = makeAdapter({
      pushDraft: async () => {
        throw new Error('network glitch');
      },
    });
    const job = makeQueuedJob();
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', adapter]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });
    assert.equal(result.failed_count, 1);
    assert.equal(result.summary[0].permanent, false);
    assert.equal(job.status, 'queued', 'requeued for next attempt');
    assert.equal(job.attempts, 1);
    assert.ok(job.next_attempt_at, 'next_attempt_at set');
    const events = eventStore.replay(TENANT_ID);
    assert.equal(events[0].event_type, 'finance.adapter.sync_failed');
    assert.equal(events[0].payload.permanent, false);
    assert.ok(events[0].payload.next_attempt_at);
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: terminal failure (attempts >= max) marks permanent', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  const originalMax = process.env.FINANCE_ADAPTER_MAX_ATTEMPTS;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';
  process.env.FINANCE_ADAPTER_MAX_ATTEMPTS = '3';

  try {
    const adapter = makeAdapter({
      pushDraft: async () => {
        throw new Error('still glitching');
      },
    });
    // attempts=2 means the next failure will be attempts=3 → equal to max → permanent
    const job = makeQueuedJob({ attempts: 2 });
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', adapter]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });
    assert.equal(result.failed_count, 1);
    assert.equal(result.summary[0].permanent, true);
    assert.equal(job.status, 'failed');
    assert.equal(job.attempts, 3);
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
    if (originalMax === undefined) delete process.env.FINANCE_ADAPTER_MAX_ATTEMPTS;
    else process.env.FINANCE_ADAPTER_MAX_ATTEMPTS = originalMax;
  }
});

test('runAdapterPollCycle in-memory: per-tenant scoping (only claims jobs for listed tenants)', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'false';

  try {
    const ownJob = makeQueuedJob({ id: 'own', tenant_id: TENANT_ID });
    const otherJob = makeQueuedJob({ id: 'other', tenant_id: OTHER_TENANT_ID });
    const bucket = makeBucket([ownJob, otherJob]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', makeAdapter()]]),
      tenantIds: [TENANT_ID], // only tenant 1
      eventStore,
    });
    assert.equal(result.claimed_count, 1);
    assert.equal(ownJob.status, 'succeeded');
    assert.equal(otherJob.status, 'queued', 'other tenant job untouched');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: invokes buildProviderPayload boundary when provided', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'false';

  try {
    let builderCalled = false;
    const job = makeQueuedJob({ payload: { foo: 'bar', _internal: 'secret' } });
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const buildProviderPayload = (canonical, runtimePolicy) => {
      builderCalled = true;
      assert.equal(runtimePolicy.provider, 'erpnext');
      assert.equal(runtimePolicy.mode, 'draft_only');
      const out = { ...canonical };
      delete out._internal;
      return out;
    };
    await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', makeAdapter()]]),
      tenantIds: [TENANT_ID],
      eventStore,
      buildProviderPayload,
    });
    assert.equal(builderCalled, true);
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('runAdapterPollCycle in-memory: payload-build failure is PERMANENT (no retry)', async () => {
  const job = makeQueuedJob();
  const bucket = makeBucket([job]);
  const eventStore = createFinanceEventStore();
  const result = await runAdapterPollCycle({
    bucket,
    adapters: new Map([['erpnext', makeAdapter()]]),
    tenantIds: [TENANT_ID],
    eventStore,
    buildProviderPayload: () => {
      throw new Error('bad metadata');
    },
  });
  assert.equal(result.failed_count, 1);
  assert.equal(result.summary[0].permanent, true);
});

// ---------------------------------------------------------------------------
// Slice 2A + 2B + 2C cross-packet integration proof (review P1 + P2 catches):
// drive the FULL producer → consumer chain end-to-end against an in-memory
// bucket using the real createFinanceDomainService + the real Slice 2A
// providerPayloadBuilder + ERPNext sandbox adapter, and verify the canonical
// snapshot survives every step (the test the original 2B tests didn't have).
// ---------------------------------------------------------------------------

import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';
import { buildProviderPayload } from '../../../lib/finance/accountingAdapters/providerPayloadBuilder.js';
import { createErpnextSandboxAdapter } from '../../../lib/finance/accountingAdapters/erpnextSandboxAdapter.js';
import {
  AGGREGATE_TYPE_TO_OBJECT_TYPE,
  aggregateTypeToObjectType,
} from '../../../lib/finance/adapterJobProcessor.js';

test('aggregateTypeToObjectType maps Track A snake_case to provider PascalCase', () => {
  assert.equal(aggregateTypeToObjectType('journal_entry'), 'JournalEntry');
  assert.equal(aggregateTypeToObjectType('account'), 'Account');
  assert.equal(AGGREGATE_TYPE_TO_OBJECT_TYPE.journal_entry, 'JournalEntry');
});

test('aggregateTypeToObjectType throws permanent-classified error for unknown aggregate_type', () => {
  assert.throws(
    () => aggregateTypeToObjectType('unknown_thing'),
    (err) =>
      err.code === 'FINANCE_ADAPTER_CONFIG_INVALID' &&
      /No provider objectType mapping/.test(err.message),
  );
});

test('runAdapterPollCycle: unknown aggregate_type → permanent failure (not retried)', async () => {
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    const job = makeQueuedJob({ aggregate_type: 'unknown_thing' });
    const bucket = makeBucket([job]);
    const eventStore = createFinanceEventStore();
    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', makeAdapter()]]),
      tenantIds: [TENANT_ID],
      eventStore,
    });
    assert.equal(result.failed_count, 1);
    assert.equal(result.summary[0].permanent, true, 'config error is permanent (no retry)');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});

test('END-TO-END: simulateDealWon → approveFinanceAction → runAdapterPollCycle invokes the REAL ERPNext adapter (P1 follow-up)', async () => {
  // This test exercises the FULL producer → consumer chain against the REAL
  // Slice 2A `createErpnextSandboxAdapter` with a mocked httpClient. The
  // earlier "end-to-end" test used a capturing fake adapter which proved
  // only that the processor forwarded SOME object to SOME adapter — it
  // could not detect the objectType vocabulary mismatch or the payload-shape
  // mismatch that Codex flagged. This test invokes the real `pushDraft`,
  // which:
  //   1) requires objectType='JournalEntry' (PascalCase) — fails with
  //      'Unsupported objectType: journal_entry' if the processor passes the
  //      raw aggregate_type.
  //   2) requires the canonical at root with `doc_number / txn_date /
  //      private_note / currency / lines` — fails to map anything if the
  //      payload is wrapped under `journal_entry`.
  // So if either fix is missing, this test fails.
  const originalEnv = process.env.FINANCE_PROVIDER_WRITES_ENABLED;
  process.env.FINANCE_PROVIDER_WRITES_ENABLED = 'true';

  try {
    const eventStore = createFinanceEventStore();
    const service = createFinanceDomainService({ eventStore });

    // Step 1 — producer creates a draft adapter_job with the canonical
    // payload shape (root-level doc_number/txn_date/lines per the
    // mapJournalEntryToQuickBooksCanonical contract).
    const sim = await service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { provider: 'erpnext', amount_cents: 12345 },
    });
    assert.equal(sim.adapter_job.status, 'draft');
    assert.ok(
      sim.adapter_job.payload?.doc_number,
      'simulateDealWon must persist the canonical at root (doc_number)',
    );
    assert.ok(
      Array.isArray(sim.adapter_job.payload?.lines),
      'simulateDealWon must persist the canonical at root (lines)',
    );
    assert.ok(
      !('journal_entry' in sim.adapter_job.payload),
      'no wrapper key — canonical lives at root per the ERPNext adapter contract',
    );

    // Step 2 — approver promotes draft → queued.
    const approveResult = await service.approveFinanceAction({
      tenantId: TENANT_ID,
      approvalId: sim.approval.id,
      actor: { id: 'approver-1', type: 'human' },
    });
    assert.equal(approveResult.promoted_adapter_jobs.length, 1);

    const queuedJob = { ...sim.adapter_job, status: 'queued' };

    // Step 3 — register the REAL ERPNext sandbox adapter with a mock
    // httpClient that captures the HTTP body the adapter would POST to
    // ERPNext. If the objectType or payload-shape fix is missing, the
    // adapter throws BEFORE httpClient.post is called — captured will stay
    // null and we'll catch it via the succeeded_count assertion.
    let capturedBody = null;
    let capturedPath = null;
    const httpClient = {
      post: async (path, body) => {
        capturedPath = path;
        capturedBody = body;
        return { data: { name: 'JE-DRAFT-001', docstatus: 0 } };
      },
      // Adapter may probe other methods at construction or pushDraft time;
      // stubs return empty so the test stays focused on pushDraft.
      get: async () => ({ data: {} }),
    };
    const erpnext = createErpnextSandboxAdapter({
      baseUrl: 'https://sandbox.example.com',
      apiKey: 'test_key',
      apiSecret: 'test_secret',
      httpClient,
      sandboxAllowlist: ['sandbox.example.com'],
    });

    const bucket = {
      journalEntries: [],
      invoices: [],
      approvals: [],
      adapterJobs: [queuedJob],
      commands: [],
    };

    const result = await runAdapterPollCycle({
      bucket,
      adapters: new Map([['erpnext', erpnext]]),
      tenantIds: [TENANT_ID],
      eventStore,
      buildProviderPayload,
    });

    // Success means: (a) processor mapped aggregate_type → JournalEntry,
    // (b) adapter accepted the objectType, (c) fromCanonical mapped the
    // root-level canonical fields to ERPNext fields, (d) httpClient.post
    // received a valid body.
    assert.equal(result.succeeded_count, 1, 'real ERPNext adapter pushDraft succeeded end-to-end');
    assert.ok(capturedBody, 'httpClient.post was called by the real adapter');
    assert.ok(
      capturedPath?.includes('/api/resource/Journal%20Entry'),
      `path uses ERPNext docType (got: ${capturedPath})`,
    );
    // ERPNext docType + docstatus invariants from §4.4
    assert.equal(capturedBody.doctype, 'Journal Entry');
    assert.equal(capturedBody.docstatus, 0, 'always docstatus=0 for sandbox/draft-only');
    // Canonical-mapped ERPNext fields present
    assert.ok(capturedBody.posting_date, 'mapped txn_date → posting_date');
    assert.ok(Array.isArray(capturedBody.accounts), 'mapped lines → accounts array');
    assert.ok(capturedBody.accounts.length >= 2, 'lines preserved through canonical mapping');
  } finally {
    if (originalEnv === undefined) delete process.env.FINANCE_PROVIDER_WRITES_ENABLED;
    else process.env.FINANCE_PROVIDER_WRITES_ENABLED = originalEnv;
  }
});
