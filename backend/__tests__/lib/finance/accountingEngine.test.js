import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildBalanceSheet,
  buildLedger,
  buildProfitAndLoss,
  createReversalDraft,
  validateJournalLines,
} from '../../../lib/finance/accountingEngine.js';

test('validateJournalLines rejects unbalanced journals', () => {
  const result = validateJournalLines([
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
  ]);

  assert.equal(result.valid, false);
  assert.match(result.errors[0], /unbalanced/i);
});

test('buildLedger and financial projections use posted entries only', () => {
  const entries = [
    {
      id: 'journal-posted',
      status: 'posted',
      lines: [
        {
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 5000,
          credit_cents: 0,
        },
        {
          account_name: 'Revenue',
          classification: 'Revenue',
          debit_cents: 0,
          credit_cents: 5000,
        },
      ],
    },
    {
      id: 'journal-draft',
      status: 'draft',
      lines: [
        {
          account_name: 'Expense',
          classification: 'Expense',
          debit_cents: 1500,
          credit_cents: 0,
        },
        {
          account_name: 'Cash',
          classification: 'Asset',
          debit_cents: 0,
          credit_cents: 1500,
        },
      ],
    },
  ];

  const ledger = buildLedger(entries);
  const profitLoss = buildProfitAndLoss(entries);
  const balanceSheet = buildBalanceSheet(entries);

  assert.equal(ledger.accounts.length, 2);
  assert.equal(profitLoss.totals.revenue_cents, 5000);
  assert.equal(profitLoss.totals.expense_cents, 0);
  assert.equal(balanceSheet.totals.assets_cents, 5000);
});

test('createReversalDraft flips debit and credit lines', () => {
  const reversal = createReversalDraft({
    id: 'journal-1',
    tenant_id: 'tenant-1',
    status: 'posted',
    lines: [
      {
        id: 'line-1',
        account_name: 'Cash',
        classification: 'Asset',
        debit_cents: 2500,
        credit_cents: 0,
      },
      {
        id: 'line-2',
        account_name: 'Revenue',
        classification: 'Revenue',
        debit_cents: 0,
        credit_cents: 2500,
      },
    ],
  });

  assert.equal(reversal.reversal_of, 'journal-1');
  assert.equal(reversal.lines[0].debit_cents, 0);
  assert.equal(reversal.lines[0].credit_cents, 2500);
  assert.equal(reversal.lines[1].debit_cents, 2500);
  assert.equal(reversal.lines[1].credit_cents, 0);
});
