import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCashFlowStatement } from '../../../lib/finance/cashFlowStatement.js';

const cash = { id: 'a_cash', account_code: '1000', account_type: 'Cash', classification: 'Asset', name: 'Cash' };
const rev = { id: 'a_rev', account_code: '4000', account_type: 'Revenue', classification: 'Revenue', name: 'Revenue' };
const exp = { id: 'a_exp', account_code: '5000', account_type: 'Expense', classification: 'Expense', name: 'Expenses' };
const ar = { id: 'a_ar', account_code: '1100', account_type: 'Receivable', classification: 'Asset', name: 'Accounts Receivable' };
const accounts = [cash, rev, exp, ar];

const posted = (lines, over = {}) => ({ status: 'posted', posted_at: '2026-06-15T00:00:00Z', lines, ...over });
const cashRevenue = (amt) => [
  { account_id: 'a_cash', classification: 'Asset', debit_cents: amt, credit_cents: 0 },
  { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: amt },
];

describe('buildCashFlowStatement', () => {
  test('empty when no posted entries or no cash accounts', () => {
    assert.deepEqual(buildCashFlowStatement([], accounts).periods, []);
    assert.deepEqual(buildCashFlowStatement([posted(cashRevenue(250000))], []).periods, []);
  });

  test('Debit Cash / Credit Revenue → inflow categorized as Revenue', () => {
    const stmt = buildCashFlowStatement([posted(cashRevenue(250000))], accounts);
    assert.equal(stmt.periods.length, 1);
    const p = stmt.periods[0];
    assert.equal(p.period, '2026-06');
    assert.equal(p.inflow_cents, 250000);
    assert.equal(p.outflow_cents, 0);
    assert.equal(p.net_cents, 250000);
    assert.equal(p.by_category.find((c) => c.classification === 'Revenue').inflow_cents, 250000);
    assert.equal(stmt.totals.net_cents, 250000);
    assert.deepEqual(stmt.cash_account_codes, ['1000']);
  });

  test('Debit Expense / Credit Cash → outflow categorized as Expense', () => {
    const p = buildCashFlowStatement(
      [posted([
        { account_id: 'a_exp', classification: 'Expense', debit_cents: 50000, credit_cents: 0 },
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 0, credit_cents: 50000 },
      ])],
      accounts,
    ).periods[0];
    assert.equal(p.outflow_cents, 50000);
    assert.equal(p.net_cents, -50000);
    assert.equal(p.by_category.find((c) => c.classification === 'Expense').outflow_cents, 50000);
  });

  test('entries that never touch a cash account are excluded (AR/Revenue accrual)', () => {
    const stmt = buildCashFlowStatement(
      [posted([
        { account_id: 'a_ar', classification: 'Asset', debit_cents: 100000, credit_cents: 0 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 100000 },
      ])],
      accounts,
    );
    assert.deepEqual(stmt.periods, []);
  });

  test('only posted/reversed count (draft/pending/approved excluded — reconciles to the ledger)', () => {
    for (const s of ['draft', 'pending_approval', 'approved']) {
      assert.deepEqual(buildCashFlowStatement([posted(cashRevenue(10000), { status: s })], accounts).periods, []);
    }
    assert.equal(buildCashFlowStatement([posted(cashRevenue(10000), { status: 'posted' })], accounts).periods.length, 1);
    assert.equal(buildCashFlowStatement([posted(cashRevenue(10000), { status: 'reversed' })], accounts).periods.length, 1);
  });

  test('buckets by period (posted_at month) in order', () => {
    const periods = buildCashFlowStatement(
      [posted(cashRevenue(10000), { posted_at: '2026-05-10T00:00:00Z' }), posted(cashRevenue(20000), { posted_at: '2026-06-10T00:00:00Z' })],
      accounts,
    ).periods;
    assert.deepEqual(periods.map((p) => p.period), ['2026-05', '2026-06']);
    assert.equal(periods[0].inflow_cents, 10000);
    assert.equal(periods[1].inflow_cents, 20000);
  });
});
