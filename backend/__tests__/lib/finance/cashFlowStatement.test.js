import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCashFlowStatement } from '../../../lib/finance/cashFlowStatement.js';

const cash = { id: 'a_cash', account_code: '1000', account_type: 'Cash', classification: 'Asset', name: 'Cash' };
const rev = { id: 'a_rev', account_code: '4000', account_type: 'Revenue', classification: 'Revenue', name: 'Revenue' };
const exp = { id: 'a_exp', account_code: '5000', account_type: 'Expense', classification: 'Expense', name: 'Expenses' };
const ar = { id: 'a_ar', account_code: '1100', account_type: 'Receivable', classification: 'Asset', name: 'Accounts Receivable' };
const bank = { id: 'a_bank', account_code: '1050', account_type: 'Bank', classification: 'Asset', name: 'Bank' };
const accounts = [cash, rev, exp, ar, bank];

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
    // cash/bank accounts (account_type ∈ {Cash, Bank}) — Bank 1050 + Cash 1000
    assert.deepEqual(stmt.cash_account_codes, ['1000', '1050']);
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

  test('an internal cash↔bank transfer nets to zero — no gross inflation (Codex PR #650 P2)', () => {
    // Debit Bank / Credit Cash: money moves between two cash-equivalent accounts;
    // total cash is unchanged, so it must NOT inflate gross inflow/outflow.
    const stmt = buildCashFlowStatement(
      [posted([
        { account_id: 'a_bank', classification: 'Asset', debit_cents: 75000, credit_cents: 0 },
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 0, credit_cents: 75000 },
      ])],
      accounts,
    );
    assert.deepEqual(stmt.periods, []);
    assert.equal(stmt.totals.inflow_cents, 0);
    assert.equal(stmt.totals.outflow_cents, 0);
  });

  test('a mixed entry nets the internal transfer and keeps the real cash movement', () => {
    // Debit Bank 100 / Credit Cash 60 / Credit Revenue 40 → net cash +40 (inflow),
    // the 60 cash→bank move nets out; categorized as Revenue.
    const p = buildCashFlowStatement(
      [posted([
        { account_id: 'a_bank', classification: 'Asset', debit_cents: 100000, credit_cents: 0 },
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 0, credit_cents: 60000 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 40000 },
      ])],
      accounts,
    ).periods[0];
    assert.equal(p.inflow_cents, 40000);
    assert.equal(p.outflow_cents, 0);
    assert.equal(p.net_cents, 40000);
    assert.equal(p.by_category.find((c) => c.classification === 'Revenue').inflow_cents, 40000);
  });

  test('a Bank account auto-created as Asset BEFORE the seed is still recognized as cash by name (Codex PR #650 P2)', () => {
    // Pre-seed, a 'Bank' line auto-created with account_type 'Asset' (auto-create
    // never assigns Cash/Bank). Its posted lines reference that Asset-typed id. With
    // the seeded Bank present (same normalized key 'Asset:bank'), the historical
    // account is matched BY NAME and its bank receipts are not silently omitted.
    const histBank = { id: 'a_hist_bank', account_code: '1500', account_type: 'Asset', classification: 'Asset', name: 'Bank' };
    const stmt = buildCashFlowStatement(
      [posted([
        { account_id: 'a_hist_bank', classification: 'Asset', debit_cents: 80000, credit_cents: 0 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 80000 },
      ])],
      [...accounts, histBank],
    );
    assert.equal(stmt.totals.inflow_cents, 80000);
    assert.ok(stmt.cash_account_codes.includes('1500')); // historical Bank counted
    assert.ok(stmt.cash_account_codes.includes('1050')); // seeded Bank still counted
  });

  test('an Asset account with NO curated cash/bank namesake is NOT treated as cash (bounded — limitation #10)', () => {
    // A custom-named asset ("Operating Account") has no seeded namesake, so the
    // name-match must not fire — it stays out (documented residual; needs the
    // deferred editable COA manager). Proves the recognition is anchored to the
    // curated seed, not an arbitrary Asset→cash heuristic.
    const op = { id: 'a_op', account_code: '1501', account_type: 'Asset', classification: 'Asset', name: 'Operating Account' };
    const stmt = buildCashFlowStatement(
      [posted([
        { account_id: 'a_op', classification: 'Asset', debit_cents: 80000, credit_cents: 0 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 80000 },
      ])],
      [...accounts, op],
    );
    assert.deepEqual(stmt.periods, []);
  });

  test('a mixed cash + non-cash entry scales contra categories to the cash portion (Codex PR #650 P2)', () => {
    // Debit Cash 50 + Debit A/R 50 / Credit Revenue 100 → only 50 cash in; the A/R 50
    // is a non-cash deferral. by_category must show Revenue inflow 50 (NOT the full
    // 100 credit), and the A/R must not appear as an outflow — so Σ(by_category)
    // reconciles with the period total.
    const p = buildCashFlowStatement(
      [posted([
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 50000, credit_cents: 0 },
        { account_id: 'a_ar', classification: 'Asset', debit_cents: 50000, credit_cents: 0 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 100000 },
      ])],
      accounts,
    ).periods[0];
    assert.equal(p.inflow_cents, 50000);
    assert.equal(p.outflow_cents, 0);
    assert.equal(p.by_category.find((c) => c.classification === 'Revenue').inflow_cents, 50000);
    // Σ(by_category) reconciles EXACTLY with the period totals
    assert.equal(p.by_category.reduce((s, c) => s + c.inflow_cents, 0), p.inflow_cents);
    assert.equal(p.by_category.reduce((s, c) => s + c.outflow_cents, 0), p.outflow_cents);
  });

  test('contra scaling distributes cents exactly even on a non-divisible split (Codex PR #650 P2)', () => {
    // Net cash 100 attributed across three equal positive contras (Revenue/Liability/
    // Equity, each weight 100) → 100/3 each. Largest-remainder must keep Σ === 100
    // (one category 34, the others 33), never 99 or 102. (A/R debit 200 is the
    // opposite-direction non-cash offset and must be excluded.)
    const p = buildCashFlowStatement(
      [posted([
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 100, credit_cents: 0 },
        { account_id: 'a_ar', classification: 'Asset', debit_cents: 200, credit_cents: 0 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 100 },
        { account_id: 'a_loan', classification: 'Liability', debit_cents: 0, credit_cents: 100 },
        { account_id: 'a_eq', classification: 'Equity', debit_cents: 0, credit_cents: 100 },
      ])],
      accounts,
    ).periods[0];
    assert.equal(p.inflow_cents, 100);
    assert.equal(p.by_category.reduce((s, c) => s + c.inflow_cents, 0), 100); // exact, despite 100/3
    assert.ok(!p.by_category.some((c) => c.classification === 'Asset')); // A/R offset excluded
    for (const c of p.by_category) assert.ok(c.inflow_cents === 33 || c.inflow_cents === 34);
  });

  test('a compound entry with offsetting cash legs backed by non-cash preserves GROSS flows (Codex PR #650 P2)', () => {
    // Debit Cash 100 + Debit Expense 100 / Credit Revenue 100 + Credit Cash 100. The
    // cash legs net to zero, but they are NOT an internal transfer — each is backed by a
    // real non-cash leg: 100 cash IN from Revenue and 100 cash OUT to Expense. The
    // statement must report both gross flows, not drop the entry as a net-zero wash.
    const p = buildCashFlowStatement(
      [posted([
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 100000, credit_cents: 0 },
        { account_id: 'a_exp', classification: 'Expense', debit_cents: 100000, credit_cents: 0 },
        { account_id: 'a_rev', classification: 'Revenue', debit_cents: 0, credit_cents: 100000 },
        { account_id: 'a_cash', classification: 'Asset', debit_cents: 0, credit_cents: 100000 },
      ])],
      accounts,
    ).periods[0];
    assert.equal(p.inflow_cents, 100000); // received from Revenue
    assert.equal(p.outflow_cents, 100000); // paid to Expense
    assert.equal(p.net_cents, 0);
    assert.equal(p.by_category.find((c) => c.classification === 'Revenue').inflow_cents, 100000);
    assert.equal(p.by_category.find((c) => c.classification === 'Expense').outflow_cents, 100000);
    // Σ(by_category) reconciles with the period totals
    assert.equal(p.by_category.reduce((s, c) => s + c.inflow_cents, 0), p.inflow_cents);
    assert.equal(p.by_category.reduce((s, c) => s + c.outflow_cents, 0), p.outflow_cents);
  });

  test('a pure internal cash↔cash transfer with no non-cash backing is still excluded', () => {
    // Debit Bank 75000 / Credit Cash 75000 — both cash legs, no non-cash backing → no
    // reportable flow (distinct from the compound case above, which HAS backing).
    assert.deepEqual(
      buildCashFlowStatement(
        [posted([
          { account_id: 'a_bank', classification: 'Asset', debit_cents: 75000, credit_cents: 0 },
          { account_id: 'a_cash', classification: 'Asset', debit_cents: 0, credit_cents: 75000 },
        ])],
        accounts,
      ).periods,
      [],
    );
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
