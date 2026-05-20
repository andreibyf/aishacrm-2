import test from 'node:test';
import assert from 'node:assert/strict';
import createFinanceDomainService from '../../../lib/finance/financeDomainService.js';

const TENANT_ID = '00000000-0000-4000-8000-000000000001';
const OTHER_TENANT_ID = '00000000-0000-4000-8000-000000000002';

test('financeDomainService enforces balanced journal drafts', () => {
  const service = createFinanceDomainService();

  assert.throws(
    () =>
      service.createJournalDraft({
        tenantId: TENANT_ID,
        actor: { id: 'user-1', type: 'human' },
        payload: {
          lines: [
            {
              account_name: 'Cash',
              classification: 'Asset',
              debit_cents: 1000,
              credit_cents: 0,
            },
            {
              account_name: 'Revenue',
              classification: 'Revenue',
              debit_cents: 0,
              credit_cents: 900,
            },
          ],
        },
      }),
    /unbalanced/i,
  );
});

test('financeDomainService keeps journal visibility tenant-scoped', () => {
  const service = createFinanceDomainService();

  service.createJournalDraft({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: {
      lines: [
        {
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 1000,
          credit_cents: 0,
        },
        {
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 1000,
        },
      ],
    },
  });

  assert.equal(service.listJournalEntries(TENANT_ID).length, 1);
  assert.equal(service.listJournalEntries(OTHER_TENANT_ID).length, 0);
});

test('financeDomainService blocks AI approvals', () => {
  const service = createFinanceDomainService();
  const result = service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 5000 },
  });

  assert.equal(result.approval_required, true);

  assert.throws(
    () =>
      service.approveFinanceAction({
        tenantId: TENANT_ID,
        approvalId: result.approval.id,
        actor: { id: 'ai-1', type: 'ai_agent' },
      }),
    /cannot approve/i,
  );
});

// CF-1: approval field naming
test('financeDomainService approval uses target_type and target_id, not aggregate_type/aggregate_id', () => {
  const service = createFinanceDomainService();
  const result = service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const approval = result.approval;
  assert.ok('target_type' in approval, 'approval should have target_type field');
  assert.ok('target_id' in approval, 'approval should have target_id field');
  assert.equal(approval.target_type, 'journal_entry');
  assert.equal(approval.target_id, result.journal_entry.id);
  assert.ok(!('aggregate_type' in approval), 'approval must not have aggregate_type field');
  assert.ok(!('aggregate_id' in approval), 'approval must not have aggregate_id field');
});

// CF-6: approval schema completeness
test('financeDomainService approval record includes risk_level, created_at, updated_at', () => {
  const service = createFinanceDomainService();
  const result = service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 10000 },
  });

  const approval = result.approval;
  assert.ok(approval.risk_level, 'approval should have risk_level');
  assert.ok(approval.created_at, 'approval should have created_at');
  assert.ok(approval.updated_at, 'approval should have updated_at');
});

// CF-2: idempotency guard — simulateDealWon throws 409 when a pending approval
// already exists for the same target journal entry id.
// Uses opts.generateId to produce a deterministic id sequence so the second call
// produces the same journal entry id as the first, triggering the guard.
test('financeDomainService simulateDealWon throws FINANCE_APPROVAL_DUPLICATE on duplicate target_id', () => {
  // generateId() is called as: `journal_${generateId()}` for journal entries,
  // `approval_${generateId()}` for approvals, and `adapter_job_${generateId()}` for jobs.
  // Sequence per simulateDealWon call: journal entry id raw → approval id raw → adapter job id raw
  const ids = [
    // first simulateDealWon
    'deal_001', // → journal entry id becomes 'journal_deal_001'
    'deal_001', // → approval id becomes 'approval_deal_001'
    'deal_001', // → adapter job id becomes 'adapter_job_deal_001'
    // second simulateDealWon — same raw id → same journal entry id 'journal_deal_001'
    'deal_001', // → journal entry id becomes 'journal_deal_001' (collision!)
    'deal_retry', // → approval id (never reached — guard fires before this)
    'deal_retry', // → adapter job id (never reached)
  ];
  let idIdx = 0;
  const service = createFinanceDomainService({
    generateId: () => ids[idIdx++] ?? 'fallback_id',
  });

  // First call — succeeds
  service.simulateDealWon({
    tenantId: TENANT_ID,
    actor: { id: 'user-1', type: 'human' },
    payload: { amount_cents: 25000 },
  });

  // Second call — same journal entry id produced, guard detects existing pending approval
  let thrown;
  try {
    service.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 25000 },
    });
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown, 'second simulateDealWon should throw');
  assert.equal(thrown.code, 'FINANCE_APPROVAL_DUPLICATE');
  assert.equal(thrown.statusCode, 409);
  assert.match(thrown.message, /pending approval already exists/i);
});

// T-9: M-3 — centralized pushApproval guard prevents duplicates on ANY code path
// Before M-3, the guard only lived inside simulateDealWon and reverseJournalEntry.
// After M-3 it lives in pushApproval(), so every future caller is automatically protected.
// This test verifies the guard fires when a pending approval is pre-seeded via seedApproval(),
// simulating what would happen if a Phase 2 code path tried to create a second approval
// for the same target without going through simulateDealWon or reverseJournalEntry.
test('T-9: pushApproval guard rejects a second pending approval for the same target via any caller', () => {
  const service = createFinanceDomainService();
  const TARGET_ID = 'invoice_00000000-0000-4000-8000-000000000099';

  // Seed a pending approval directly into the bucket (simulates a Phase 2 domain method)
  service.seedApproval({
    id: 'approval_pre_existing',
    tenant_id: TENANT_ID,
    target_type: 'invoice',
    target_id: TARGET_ID,
    status: 'pending',
    requested_by: 'user-1',
    requested_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  // Seed a posted journal entry so simulateDealWon has something to build on
  service.seedJournalEntry({
    id: TARGET_ID,
    tenant_id: TENANT_ID,
    status: 'draft',
    currency: 'usd',
    lines: [],
  });

  // Now try to create an approval for the same target via simulateDealWon — must throw 409
  // We use a custom generateId to force the journal entry to use TARGET_ID
  const ids = ['00000000-0000-4000-8000-000000000099', 'approval_new', 'adapter_new'];
  let idx = 0;
  const service2 = createFinanceDomainService({
    generateId: () => ids[idx++] ?? 'fallback',
  });

  // Seed the pre-existing approval into service2
  service2.seedApproval({
    id: 'approval_pre_existing',
    tenant_id: TENANT_ID,
    target_type: 'journal_entry',
    target_id: `journal_${ids[0]}`,
    status: 'pending',
    requested_by: 'user-1',
    requested_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  let thrown;
  try {
    service2.simulateDealWon({
      tenantId: TENANT_ID,
      actor: { id: 'user-1', type: 'human' },
      payload: { amount_cents: 5000 },
    });
  } catch (err) {
    thrown = err;
  }

  assert.ok(thrown, 'should throw when a pending approval already exists for the target');
  assert.equal(thrown.code, 'FINANCE_APPROVAL_DUPLICATE');
  assert.equal(thrown.statusCode, 409);
});

test('financeDomainService reversal creates a new journal entry instead of deleting history', () => {
  const service = createFinanceDomainService();

  service.seedJournalEntry({
    id: 'journal-posted-1',
    tenant_id: TENANT_ID,
    status: 'posted',
    memo: 'Posted revenue',
    currency: 'usd',
    lines: [
      {
        account_name: 'Cash',
        classification: 'Asset',
        debit_cents: 2000,
        credit_cents: 0,
      },
      {
        account_name: 'Revenue',
        classification: 'Revenue',
        debit_cents: 0,
        credit_cents: 2000,
      },
    ],
  });

  const result = service.reverseJournalEntry({
    tenantId: TENANT_ID,
    journalEntryId: 'journal-posted-1',
    actor: { id: 'user-2', type: 'human' },
    payload: { memo: 'Correction' },
  });

  const entries = service.listJournalEntries(TENANT_ID);
  assert.equal(entries.length, 2);
  assert.equal(result.reversal_entry.reversal_of, 'journal-posted-1');
  assert.equal(entries[0].id, 'journal-posted-1');
  assert.equal(entries[1].id, result.reversal_entry.id);
});
