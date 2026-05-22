import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildEvidencePack,
  queryAuditTimeline,
  getReversalChain,
  isCanonicalFinanceEvent,
  RESERVED_INFRASTRUCTURE_EVENT,
} from '../../../lib/finance/auditEvidenceBuilder.js';
import createFinanceEventStore from '../../../lib/finance/financeEventStore.js';

const TENANT_A = '00000000-0000-4000-8000-aaaaaaaaaaaa';
const TENANT_B = '00000000-0000-4000-8000-bbbbbbbbbbbb';

// Fixed injection values so two builds of the same stream are byte-identical.
const FIXED_PACK_ID = 'pack_fixed-0000-0000-0000-000000000001';
const FIXED_GENERATED_AT = '2025-12-19T10:00:00.000Z';
const GENERATED_BY = { actor_id: 'user_controller', actor_type: 'human' };

/**
 * A minimal event-envelope factory matching Track A shape: aggregate_type /
 * aggregate_id on events. created_at must be supplied so ordering and hashing
 * are deterministic in tests.
 */
function evt(overrides = {}) {
  return {
    id: overrides.id,
    tenant_id: overrides.tenant_id ?? TENANT_A,
    event_type: overrides.event_type,
    aggregate_type: overrides.aggregate_type ?? null,
    aggregate_id: overrides.aggregate_id ?? null,
    actor_id: overrides.actor_id ?? null,
    actor_type: overrides.actor_type ?? 'human',
    source: overrides.source ?? 'finance',
    request_id: overrides.request_id ?? null,
    braid_trace_id: overrides.braid_trace_id ?? null,
    correlation_id: overrides.correlation_id ?? null,
    causation_id: overrides.causation_id ?? null,
    payload: overrides.payload ?? {},
    policy_decision: overrides.policy_decision ?? {},
    created_at: overrides.created_at,
  };
}

/**
 * The canonical worked example: AI drafts an invoice → approval requested →
 * approval approved → invoice posted. Linked by correlation_id / causation_id.
 */
function aiInvoiceChain(tenantId = TENANT_A) {
  const draftId = '00000000-0000-4000-8000-aaa000000001';
  const approvalReqId = '00000000-0000-4000-8000-aaa000000002';
  const approvalAppId = '00000000-0000-4000-8000-aaa000000003';
  const postedId = '00000000-0000-4000-8000-aaa000000004';

  return [
    evt({
      id: draftId,
      tenant_id: tenantId,
      event_type: 'finance.invoice.draft_created',
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_f7a9',
      actor_id: 'braid_agent_001',
      actor_type: 'ai_agent',
      source: 'braid',
      request_id: 'req_1234',
      braid_trace_id: 'trace_braid_001',
      correlation_id: 'req_1234',
      causation_id: null,
      payload: { invoice: { id: 'invoice_f7a9', status: 'draft', total_cents: 250000 } },
      policy_decision: {
        allowed: true,
        requires_approval: false,
        risk_level: 'low',
        model: 'gpt-4o',
      },
      created_at: '2025-12-19T08:00:01.000Z',
    }),
    evt({
      id: approvalReqId,
      tenant_id: tenantId,
      event_type: 'finance.approval.requested',
      aggregate_type: 'approval',
      aggregate_id: 'approval_r001',
      actor_id: 'braid_agent_001',
      actor_type: 'ai_agent',
      source: 'braid',
      request_id: 'req_1234',
      braid_trace_id: 'trace_braid_001',
      correlation_id: 'req_1234',
      causation_id: draftId,
      payload: {
        approval: {
          id: 'approval_r001',
          target_type: 'invoice',
          target_id: 'invoice_f7a9',
          status: 'pending',
          requested_by: 'braid_agent_001',
          requested_at: '2025-12-19T08:00:02.000Z',
        },
      },
      policy_decision: { allowed: true, requires_approval: true, risk_level: 'low' },
      created_at: '2025-12-19T08:00:02.000Z',
    }),
    evt({
      id: approvalAppId,
      tenant_id: tenantId,
      event_type: 'finance.approval.approved',
      aggregate_type: 'approval',
      aggregate_id: 'approval_r001',
      actor_id: 'user_controller',
      actor_type: 'human',
      source: 'finance',
      request_id: 'req_1234',
      correlation_id: 'req_1234',
      causation_id: approvalReqId,
      payload: {
        approval: {
          id: 'approval_r001',
          target_type: 'invoice',
          target_id: 'invoice_f7a9',
          status: 'approved',
          requested_by: 'braid_agent_001',
          requested_at: '2025-12-19T08:00:02.000Z',
          approved_by: 'user_controller',
          approved_at: '2025-12-19T09:15:00.000Z',
        },
      },
      policy_decision: { allowed: true, requires_approval: false, risk_level: 'low' },
      created_at: '2025-12-19T09:15:00.000Z',
    }),
    evt({
      id: postedId,
      tenant_id: tenantId,
      event_type: 'finance.invoice.posted',
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_f7a9',
      actor_id: 'user_controller',
      actor_type: 'human',
      source: 'finance',
      request_id: 'req_1234',
      correlation_id: 'req_1234',
      causation_id: approvalAppId,
      payload: { invoice: { id: 'invoice_f7a9', status: 'sent', total_cents: 250000 } },
      policy_decision: { allowed: true, requires_approval: false, risk_level: 'low' },
      created_at: '2025-12-19T09:15:05.000Z',
    }),
  ];
}

// ── Determinism ─────────────────────────────────────────────────────────────

test('evidence pack is deterministic from the same event stream', async () => {
  const events = aiInvoiceChain();
  const opts = {
    tenantId: TENANT_A,
    fromDate: '2025-12-18',
    toDate: '2025-12-20',
    generatedBy: GENERATED_BY,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
  };

  const pack1 = await buildEvidencePack(events, opts);
  const pack2 = await buildEvidencePack(events, opts);

  assert.deepEqual(pack1, pack2, 'two builds with injected ids must be deeply equal');
  assert.equal(pack1.integrity.events_hash, pack2.integrity.events_hash);
  assert.equal(pack1.integrity.approvals_hash, pack2.integrity.approvals_hash);
  assert.equal(pack1.integrity.pack_hash, pack2.integrity.pack_hash);
  // Byte-identical serialization is the strongest determinism guarantee.
  assert.equal(JSON.stringify(pack1), JSON.stringify(pack2));
});

test('pack_hash is computed over the pack excluding integrity.pack_hash itself', async () => {
  const pack = await buildEvidencePack(aiInvoiceChain(), {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.ok(typeof pack.integrity.pack_hash === 'string');
  assert.match(pack.integrity.pack_hash, /^[0-9a-f]{64}$/, 'pack_hash is a SHA-256 hex digest');
  assert.equal(pack.integrity.algorithm, 'SHA-256');
});

// ── Tenant isolation ────────────────────────────────────────────────────────

test('tenant isolation: a pack for tenant A contains zero tenant B data', async () => {
  const mixed = [
    ...aiInvoiceChain(TENANT_A),
    evt({
      id: '00000000-0000-4000-8000-bbb000000001',
      tenant_id: TENANT_B,
      event_type: 'finance.invoice.draft_created',
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_TENANT_B_SECRET',
      payload: { invoice: { id: 'invoice_TENANT_B_SECRET', status: 'draft' } },
      created_at: '2025-12-19T08:30:00.000Z',
    }),
    evt({
      id: '00000000-0000-4000-8000-bbb000000002',
      tenant_id: TENANT_B,
      event_type: 'finance.approval.requested',
      aggregate_type: 'approval',
      aggregate_id: 'approval_TENANT_B',
      payload: { approval: { id: 'approval_TENANT_B', target_type: 'invoice', status: 'pending' } },
      created_at: '2025-12-19T08:31:00.000Z',
    }),
  ];

  const pack = await buildEvidencePack(mixed, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  assert.equal(pack.tenant_id, TENANT_A);
  assert.ok(
    pack.events.every((e) => e.tenant_id === TENANT_A),
    'every event belongs to A',
  );
  const serialized = JSON.stringify(pack);
  assert.ok(!serialized.includes(TENANT_B), 'no tenant B id anywhere in the pack');
  assert.ok(!serialized.includes('TENANT_B_SECRET'), 'no tenant B aggregate leaks');
  assert.equal(pack.event_count, 4, 'only the 4 tenant-A events appear');
});

test('queryAuditTimeline filters strictly by tenant_id', async () => {
  const mixed = [...aiInvoiceChain(TENANT_A), ...aiInvoiceChain(TENANT_B)];
  const resultA = await queryAuditTimeline(mixed, { tenant_id: TENANT_A });
  assert.equal(resultA.total_count, 4);
  assert.ok(resultA.events.every((e) => e.tenant_id === TENANT_A));
});

// ── Missing optional lineage handled gracefully ─────────────────────────────

test('missing optional lineage: no approvals / no adapter jobs / no reversals', async () => {
  const eventsOnly = [
    evt({
      id: '00000000-0000-4000-8000-ccc000000001',
      event_type: 'finance.invoice.draft_created',
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_plain',
      payload: { invoice: { id: 'invoice_plain', status: 'draft' } },
      created_at: '2025-12-19T08:00:00.000Z',
    }),
  ];

  const pack = await buildEvidencePack(eventsOnly, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  assert.deepEqual(pack.approvals, [], 'no approvals → empty array');
  assert.deepEqual(pack.adapter_jobs, [], 'no adapter jobs → empty array');
  assert.deepEqual(pack.reversals, { count: 0, entries: [] }, 'no reversals → zero count');
  assert.equal(pack.event_count, 1);
});

test('buildEvidencePack does not throw on an empty event stream', async () => {
  const pack = await buildEvidencePack([], {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(pack.event_count, 0);
  assert.deepEqual(pack.events, []);
  assert.deepEqual(pack.approvals, []);
  assert.deepEqual(pack.reversals, { count: 0, entries: [] });
});

test('malformed lineage is handled gracefully and never mutates source events', async () => {
  // Lineage payloads that are present but structurally broken: a string where
  // an approval object is expected, an adapter job missing its id, a non-string
  // original_entry_id, and a null payload. The builder must not throw, must not
  // mutate any source event, and must skip the broken lineage rather than
  // fabricate it.
  const malformed = [
    evt({
      id: '00000000-0000-4000-8000-ddd0000000a1',
      event_type: 'finance.invoice.draft_created',
      aggregate_type: 'invoice',
      aggregate_id: 'invoice_ok',
      payload: { invoice: { id: 'invoice_ok', status: 'draft' } },
      created_at: '2025-12-19T08:00:00.000Z',
    }),
    evt({
      id: '00000000-0000-4000-8000-ddd0000000a2',
      event_type: 'finance.approval.requested',
      aggregate_type: 'approval',
      aggregate_id: 'approval_broken',
      payload: { approval: 'not-an-object' }, // approval is a string
      created_at: '2025-12-19T08:01:00.000Z',
    }),
    evt({
      id: '00000000-0000-4000-8000-ddd0000000a3',
      event_type: 'finance.adapter.sync_queued',
      aggregate_type: 'adapter_job',
      aggregate_id: 'adapter_broken',
      payload: { adapter_job: { provider: 'quickbooks', status: 'queued' } }, // no id
      created_at: '2025-12-19T08:02:00.000Z',
    }),
    evt({
      id: '00000000-0000-4000-8000-ddd0000000a4',
      event_type: 'finance.journal.reversal_requested',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_broken',
      payload: { original_entry_id: 12345 }, // non-string lineage key
      created_at: '2025-12-19T08:03:00.000Z',
    }),
    evt({
      id: '00000000-0000-4000-8000-ddd0000000a5',
      event_type: 'finance.journal.posted',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_nullpayload',
      payload: null, // payload absent entirely
      created_at: '2025-12-19T08:04:00.000Z',
    }),
  ];

  const before = JSON.stringify(malformed);

  const pack = await buildEvidencePack(malformed, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  // Source events are byte-identical — malformed lineage never mutates input.
  assert.equal(JSON.stringify(malformed), before, 'malformed input left untouched');

  // The pack is still produced; broken lineage is skipped, not fatal.
  assert.equal(pack.event_count, 5, 'all canonical events still counted');
  assert.deepEqual(pack.approvals, [], 'a non-object approval is skipped');
  assert.deepEqual(pack.adapter_jobs, [], 'an adapter job with no id is skipped');

  // Determinism still holds for a malformed stream.
  const pack2 = await buildEvidencePack(malformed, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(pack.integrity.pack_hash, pack2.integrity.pack_hash);
});

// ── Full chain reconstruction ───────────────────────────────────────────────

test('full chain: AI-drafted invoice → approval requested → approved → posted', async () => {
  const events = aiInvoiceChain();
  const pack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    targetType: 'invoice',
    targetId: 'invoice_f7a9',
    generatedBy: GENERATED_BY,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
  });

  // targetId widens to the full correlation_id span — all 4 events captured.
  assert.equal(pack.event_count, 4, 'full intent chain captured via correlation_id');
  const types = pack.events.map((e) => e.event_type);
  assert.deepEqual(types, [
    'finance.invoice.draft_created',
    'finance.approval.requested',
    'finance.approval.approved',
    'finance.invoice.posted',
  ]);

  // Causation chain is intact end-to-end.
  assert.equal(pack.events[0].causation_id, null);
  assert.equal(pack.events[1].causation_id, pack.events[0].id);
  assert.equal(pack.events[2].causation_id, pack.events[1].id);
  assert.equal(pack.events[3].causation_id, pack.events[2].id);

  // Approval chain present, with Track A target_type / target_id vocabulary.
  assert.equal(pack.approvals.length, 1);
  assert.equal(pack.approvals[0].id, 'approval_r001');
  assert.equal(pack.approvals[0].status, 'approved', 'latest snapshot wins');
  assert.equal(pack.approvals[0].target_type, 'invoice');
  assert.equal(pack.approvals[0].target_id, 'invoice_f7a9');
  assert.ok(!('object_type' in pack.approvals[0]), 'never introduces object_type');

  // Actor lineage: one AI actor, one human actor.
  assert.equal(pack.summary.actors.length, 2);
  assert.equal(pack.summary.ai_actions.total, 2);
  assert.equal(pack.summary.ai_actions.required_approval, 1);

  // Governance decision snapshots captured for each event with a decision.
  assert.equal(pack.governance_decisions.length, 4);

  // State timeline: invoice has draft then posted snapshots.
  const invoiceTimeline = pack.state_timeline.find((t) => t.aggregate_id === 'invoice_f7a9');
  assert.ok(invoiceTimeline);
  assert.equal(invoiceTimeline.snapshots.length, 2);
  assert.equal(invoiceTimeline.snapshots[0].state.status, 'draft');
  assert.equal(invoiceTimeline.snapshots[1].state.status, 'sent');
});

// ── Reversal lineage ────────────────────────────────────────────────────────

test('reversal lineage reconstructed via payload.original_entry_id', async () => {
  const postedId = '00000000-0000-4000-8000-ddd000000001';
  const reversalReqId = '00000000-0000-4000-8000-ddd000000002';
  const reversalApprovedId = '00000000-0000-4000-8000-ddd000000003';
  const reversedId = '00000000-0000-4000-8000-ddd000000004';

  const events = [
    evt({
      id: postedId,
      event_type: 'finance.journal.posted',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_A',
      correlation_id: 'corr_orig',
      payload: { journal_entry: { id: 'journal_A', status: 'posted' } },
      created_at: '2025-12-19T08:00:00.000Z',
    }),
    evt({
      id: reversalReqId,
      event_type: 'finance.journal.reversal_requested',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_B',
      correlation_id: 'corr_rev',
      causation_id: postedId,
      payload: {
        original_entry_id: 'journal_A',
        reversal_entry: { id: 'journal_B', status: 'draft' },
      },
      created_at: '2025-12-19T08:10:00.000Z',
    }),
    evt({
      id: reversalApprovedId,
      event_type: 'finance.approval.approved',
      aggregate_type: 'approval',
      aggregate_id: 'approval_rev',
      correlation_id: 'corr_rev',
      causation_id: reversalReqId,
      payload: {
        approval: { id: 'approval_rev', target_type: 'journal_entry', status: 'approved' },
      },
      created_at: '2025-12-19T08:20:00.000Z',
    }),
    evt({
      id: reversedId,
      event_type: 'finance.journal.reversed',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_B',
      correlation_id: 'corr_rev',
      causation_id: reversalApprovedId,
      payload: {
        original_entry_id: 'journal_A',
        journal_entry: { id: 'journal_B', status: 'posted' },
      },
      created_at: '2025-12-19T08:30:00.000Z',
    }),
  ];

  const chain = await getReversalChain(events, TENANT_A, 'journal_A');
  assert.equal(chain.original_entry_id, 'journal_A');
  assert.equal(chain.original_events.length, 1, 'one event for the original entry');
  assert.equal(chain.original_events[0].id, postedId);
  assert.equal(chain.reversal_chains.length, 1, 'one reversal entry');
  assert.equal(chain.reversal_chains[0].reversal_entry_id, 'journal_B');
  assert.equal(chain.reversal_chains[0].events.length, 2, 'reversal_requested + reversed');

  const pack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(pack.reversals.count, 1);
  assert.deepEqual(pack.summary.reversals.entries, ['journal_A']);
  assert.equal(pack.reversals.entries[0].original_entry_id, 'journal_A');
});

// ── Adapter-job lineage ─────────────────────────────────────────────────────

test('adapter-job lineage present when adapter events exist', async () => {
  const events = [
    evt({
      id: '00000000-0000-4000-8000-eee000000001',
      event_type: 'finance.adapter.sync_queued',
      aggregate_type: 'adapter_job',
      aggregate_id: 'adapter_job_1',
      payload: {
        adapter_job: {
          id: 'adapter_job_1',
          provider: 'quickbooks',
          aggregate_type: 'journal_entry',
          aggregate_id: 'journal_A',
          operation: 'push_draft',
          mode: 'draft_only',
          status: 'queued',
        },
      },
      created_at: '2025-12-19T08:00:00.000Z',
    }),
    evt({
      id: '00000000-0000-4000-8000-eee000000002',
      event_type: 'finance.adapter.sync_succeeded',
      aggregate_type: 'adapter_job',
      aggregate_id: 'adapter_job_1',
      payload: {
        adapter_job: {
          id: 'adapter_job_1',
          provider: 'quickbooks',
          aggregate_type: 'journal_entry',
          aggregate_id: 'journal_A',
          operation: 'push_draft',
          mode: 'draft_only',
          status: 'succeeded',
        },
      },
      created_at: '2025-12-19T08:05:00.000Z',
    }),
  ];

  const pack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  assert.equal(pack.adapter_jobs.length, 1, 'deduplicated to one adapter job');
  assert.equal(pack.adapter_jobs[0].id, 'adapter_job_1');
  assert.equal(pack.adapter_jobs[0].status, 'succeeded', 'latest snapshot wins');
  assert.equal(pack.adapter_jobs[0].provider, 'quickbooks');
  // Adapter job uses Track A aggregate_type / aggregate_id vocabulary.
  assert.equal(pack.adapter_jobs[0].aggregate_type, 'journal_entry');
  assert.ok(!('object_type' in pack.adapter_jobs[0]), 'never introduces object_type');
});

// ── Tamper evidence ─────────────────────────────────────────────────────────

test('tamper evidence: mutating one event yields a different events_hash', async () => {
  const events = aiInvoiceChain();
  const pack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  // Simulate a tampered event stream: change a total on the first event.
  const tampered = aiInvoiceChain();
  tampered[0] = {
    ...tampered[0],
    payload: { invoice: { id: 'invoice_f7a9', status: 'draft', total_cents: 999999 } },
  };
  const tamperedPack = await buildEvidencePack(tampered, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  assert.notEqual(
    pack.integrity.events_hash,
    tamperedPack.integrity.events_hash,
    'a mutated event must produce a different events_hash',
  );
  assert.notEqual(
    pack.integrity.pack_hash,
    tamperedPack.integrity.pack_hash,
    'pack_hash also changes when an event is tampered',
  );
});

// ── Canonical event-name enforcement ────────────────────────────────────────

test('only canonical finance.* event names are consumed; command names are rejected', async () => {
  assert.equal(isCanonicalFinanceEvent('finance.invoice.draft_created'), true);
  assert.equal(isCanonicalFinanceEvent('PostJournalEntryCommand'), false);
  assert.equal(isCanonicalFinanceEvent('ApproveFinanceActionCommand'), false);
  assert.equal(isCanonicalFinanceEvent(null), false);
  assert.equal(isCanonicalFinanceEvent(undefined), false);

  const events = [
    ...aiInvoiceChain(),
    // A command name masquerading as an event_type must NOT be accepted.
    evt({
      id: '00000000-0000-4000-8000-fff000000001',
      event_type: 'PostJournalEntryCommand',
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_bogus',
      payload: { journal_entry: { id: 'journal_bogus', status: 'posted' } },
      created_at: '2025-12-19T09:30:00.000Z',
    }),
  ];

  const pack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  assert.equal(pack.event_count, 4, 'the command-name event is excluded');
  assert.ok(
    pack.events.every((e) => e.event_type.startsWith('finance.')),
    'every event in the pack is a canonical finance.* event',
  );
  assert.ok(
    !pack.events.some((e) => e.event_type === 'PostJournalEntryCommand'),
    'command name never appears as an event in the pack',
  );
});

// ── Reserved infrastructure event handling ──────────────────────────────────

test('reserved finance.audit.event_appended is excluded from normal evidence', async () => {
  const events = [
    ...aiInvoiceChain(),
    evt({
      id: '00000000-0000-4000-8000-aaa000000099',
      event_type: RESERVED_INFRASTRUCTURE_EVENT,
      aggregate_type: 'journal_entry',
      aggregate_id: 'journal_A',
      payload: {},
      created_at: '2025-12-19T09:40:00.000Z',
    }),
  ];

  const normalPack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(normalPack.event_count, 4, 'infrastructure event excluded by default');

  const integrityPack = await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
    includeInfrastructureEvents: true,
  });
  assert.equal(integrityPack.event_count, 5, 'infrastructure event included when flag is set');
});

// ── Event store input ───────────────────────────────────────────────────────

test('buildEvidencePack accepts a finance event store as input', async () => {
  const store = createFinanceEventStore();
  for (const e of aiInvoiceChain()) {
    store.append(e);
  }

  const pack = await buildEvidencePack(store, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });

  assert.equal(pack.event_count, 4, 'all four events read from the store');
  assert.ok(pack.events.every((e) => e.tenant_id === TENANT_A));
});

test('buildEvidencePack accepts an async (Promise-returning) event store', async () => {
  // Mirrors the Postgres adapter financeEventStore.pg.js, whose replay() and
  // query() are async. resolveEvents must AWAIT the store — never treat the
  // returned Promise as if it were a plain array.
  const chain = aiInvoiceChain();
  const asyncStore = {
    replay: async (tenantId) => chain.filter((e) => e.tenant_id === tenantId),
    query: async ({ tenant_id }) => chain.filter((e) => e.tenant_id === tenant_id),
  };

  const pack = await buildEvidencePack(asyncStore, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(pack.event_count, 4, 'all four events read from the async store');
  assert.ok(pack.events.every((e) => e.tenant_id === TENANT_A));

  // queryAuditTimeline and getReversalChain must also handle an async store.
  const timeline = await queryAuditTimeline(asyncStore, { tenant_id: TENANT_A });
  assert.equal(timeline.total_count, 4);

  // A pack built from the async store must match one built from the raw array.
  const arrayPack = await buildEvidencePack(chain, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(pack.integrity.pack_hash, arrayPack.integrity.pack_hash);
});

test('queryAuditTimeline supports event-type prefix matching', async () => {
  const events = aiInvoiceChain();
  const invoiceEvents = await queryAuditTimeline(events, {
    tenant_id: TENANT_A,
    event_type: 'finance.invoice.*',
  });
  assert.equal(invoiceEvents.total_count, 2, 'draft_created + posted');
  assert.ok(invoiceEvents.events.every((e) => e.event_type.startsWith('finance.invoice.')));
});

test('buildEvidencePack is read-only — source events are not mutated', async () => {
  const events = aiInvoiceChain();
  const before = JSON.stringify(events);
  await buildEvidencePack(events, {
    tenantId: TENANT_A,
    packId: FIXED_PACK_ID,
    generatedAt: FIXED_GENERATED_AT,
    generatedBy: GENERATED_BY,
  });
  assert.equal(JSON.stringify(events), before, 'source events untouched');
});
