import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLedger,
  buildProfitAndLoss,
  buildBalanceSheet,
} from '../../../lib/finance/accountingEngine.js';

// Beta integrity slice — end-to-end number parity at the source layer.
// Locks the double-entry math against a hand-computed, multi-status fixture and
// proves draft / pending_approval entries never reach the ledger. A failure
// here is a real accuracy bug, not a test that needs adjusting.

const T = '00000000-0000-4000-8000-000000000011';
const line = (classification, account_name, debit_cents, credit_cents) => ({
  classification,
  account_name,
  debit_cents,
  credit_cents,
});
const entry = (status, lines) => ({ tenant_id: T, status, lines });

const FIXTURE = [
  entry('posted', [line('Asset', 'Cash', 500000, 0), line('Equity', 'Owner Capital', 0, 500000)]),
  entry('posted', [line('Asset', 'Cash', 200000, 0), line('Revenue', 'Sales', 0, 200000)]),
  entry('posted', [line('Expense', 'Rent', 80000, 0), line('Asset', 'Cash', 0, 80000)]),
  entry('draft', [line('Asset', 'Cash', 999999, 0), line('Revenue', 'Sales', 0, 999999)]),
  entry('pending_approval', [
    line('Asset', 'Cash', 777777, 0),
    line('Revenue', 'Sales', 0, 777777),
  ]),
];

describe('accountingEngine — integrity parity', () => {
  test('ledger counts only posted/reversed and totals balance', () => {
    const ledger = buildLedger(FIXTURE);
    const cash = ledger.accounts.find((a) => a.account_name === 'Cash');
    assert.equal(cash.debit_cents, 700000);
    assert.equal(cash.credit_cents, 80000);
    assert.equal(cash.balance_cents, 620000);
    assert.equal(ledger.totals.debit_cents, 780000);
    assert.equal(ledger.totals.credit_cents, 780000);
    // draft / pending_approval excluded → no 999999 / 777777 leakage anywhere
    assert.equal(
      ledger.accounts.some((a) => a.debit_cents >= 999999 || a.credit_cents >= 777777),
      false,
    );
  });

  test('profit & loss totals match hand-computed', () => {
    const pl = buildProfitAndLoss(FIXTURE);
    assert.equal(pl.totals.revenue_cents, 200000);
    assert.equal(pl.totals.expense_cents, 80000);
    assert.equal(pl.totals.net_income_cents, 120000);
  });

  test('balance sheet exposes honest is_balanced=false when income is unclosed', () => {
    const bs = buildBalanceSheet(FIXTURE);
    assert.equal(bs.totals.assets_cents, 620000);
    assert.equal(bs.totals.liabilities_cents, 0);
    assert.equal(bs.totals.equity_cents, 500000);
    assert.equal(bs.totals.is_balanced, false);
  });

  test('capital-only fixture is balanced', () => {
    const bs = buildBalanceSheet([FIXTURE[0]]);
    assert.equal(bs.totals.assets_cents, 500000);
    assert.equal(bs.totals.equity_cents, 500000);
    assert.equal(bs.totals.is_balanced, true);
  });
});
