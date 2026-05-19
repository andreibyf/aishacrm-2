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
