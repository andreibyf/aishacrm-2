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

// T-8: R-3 — buildBalanceSheet must surface the accounting equation check
test('T-8: buildBalanceSheet returns is_balanced: true when Assets = Liabilities + Equity', () => {
  const entries = [
    {
      id: 'j-balanced',
      status: 'posted',
      lines: [
        { account_name: 'Cash', classification: 'Asset', debit_cents: 10000, credit_cents: 0 },
        { account_name: 'Loan', classification: 'Liability', debit_cents: 0, credit_cents: 6000 },
        { account_name: 'Equity', classification: 'Equity', debit_cents: 0, credit_cents: 4000 },
      ],
    },
  ];
  const sheet = buildBalanceSheet(entries);
  assert.equal(sheet.totals.assets_cents, 10000);
  assert.equal(sheet.totals.liabilities_cents, 6000);
  assert.equal(sheet.totals.equity_cents, 4000);
  assert.equal(sheet.totals.is_balanced, true);
});

test('T-8: buildBalanceSheet returns is_balanced: false when equation does not hold', () => {
  // Deliberately corrupt: Asset 10000 vs Liabilities 6000 + Equity 3000 = 9000
  const entries = [
    {
      id: 'j-unbalanced',
      status: 'posted',
      lines: [
        { account_name: 'Cash', classification: 'Asset', debit_cents: 10000, credit_cents: 0 },
        { account_name: 'Loan', classification: 'Liability', debit_cents: 0, credit_cents: 6000 },
        { account_name: 'Equity', classification: 'Equity', debit_cents: 0, credit_cents: 3000 },
      ],
    },
  ];
  const sheet = buildBalanceSheet(entries);
  assert.equal(sheet.totals.is_balanced, false);
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

// T-7: R-2 — createReversalDraft must propagate ai_generated from source entry
test('T-7: createReversalDraft propagates ai_generated: true from source entry when override not set', () => {
  const sourceEntry = {
    id: 'journal-ai',
    tenant_id: 'tenant-1',
    status: 'posted',
    ai_generated: true,
    lines: [
      { account_name: 'Cash', classification: 'Asset', debit_cents: 1000, credit_cents: 0 },
      { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 1000 },
    ],
  };

  // No ai_generated override — should inherit from source
  const reversal = createReversalDraft(sourceEntry, {});
  assert.equal(
    reversal.ai_generated,
    true,
    'reversal must inherit ai_generated: true from source entry',
  );
});

test('T-7: createReversalDraft propagates ai_generated: false from source entry', () => {
  const sourceEntry = {
    id: 'journal-human',
    tenant_id: 'tenant-1',
    status: 'posted',
    ai_generated: false,
    lines: [
      { account_name: 'Cash', classification: 'Asset', debit_cents: 500, credit_cents: 0 },
      { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 500 },
    ],
  };

  const reversal = createReversalDraft(sourceEntry, {});
  assert.equal(reversal.ai_generated, false);
});

test('T-7: createReversalDraft override explicitly sets ai_generated regardless of source', () => {
  const sourceEntry = {
    id: 'journal-ai',
    tenant_id: 'tenant-1',
    status: 'posted',
    ai_generated: true,
    lines: [
      { account_name: 'Cash', classification: 'Asset', debit_cents: 500, credit_cents: 0 },
      { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 500 },
    ],
  };

  // Override explicitly to false — must take precedence over source entry
  const reversal = createReversalDraft(sourceEntry, { ai_generated: false });
  assert.equal(reversal.ai_generated, false);
});

test('T-7: createReversalDraft defaults ai_generated to false when neither source nor override set it', () => {
  const sourceEntry = {
    id: 'journal-no-flag',
    tenant_id: 'tenant-1',
    status: 'posted',
    lines: [
      { account_name: 'Cash', classification: 'Asset', debit_cents: 200, credit_cents: 0 },
      { account_name: 'Revenue', classification: 'Revenue', debit_cents: 0, credit_cents: 200 },
    ],
  };

  const reversal = createReversalDraft(sourceEntry, {});
  assert.equal(
    reversal.ai_generated,
    false,
    'defaults to false when source has no ai_generated field',
  );
});
