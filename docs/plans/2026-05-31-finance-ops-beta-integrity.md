# Finance Ops Beta Integrity Slice — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Prove Finance Ops numbers are captured correctly end-to-end (engine → API → UI), stop the one UI spot that can hide a calculation error, and document beta integrity + limitations honestly.

**Architecture:** Verification-first. No new endpoints, no export, no contract changes. Add parity tests across the existing `accountingEngine` → `finance.v2` routes → `LedgerSummary` chain using the in-memory `seedJournalEntry` seam; make `LedgerSummary`'s balance state three-valued (Yes / unbalanced-warning / unknown) so an absent/failed/unbalanced sheet is never shown as "Balanced: Yes"; add two docs + CHANGELOG.

**Tech Stack:** Node.js native test runner + supertest (backend), Vitest + Testing Library (frontend), React 18.

**⚠️ Commit policy for this slice:** **HOLD ALL COMMITS for Codex review.** Each task ends with `git add` (stage only). Do NOT `git commit` or push until Codex clears and Andrei authorizes. Final task is a review handoff, not a commit.

**Shared parity fixture (used by Tasks 1–3).** All entries `tenant_id = '00000000-0000-4000-8000-000000000011'`, `status` as noted. Lines use `accountingEngine` shape (`classification`, `account_name`, `debit_cents`, `credit_cents`).

```
POSTED A (capital):   Dr Cash[Asset] 500000   / Cr Owner Capital[Equity] 500000
POSTED B (revenue):   Dr Cash[Asset] 200000   / Cr Sales[Revenue]        200000
POSTED C (expense):   Dr Rent[Expense] 80000  / Cr Cash[Asset]            80000
DRAFT D (must be excluded):        Dr Cash[Asset] 999999 / Cr Sales[Revenue] 999999
PENDING_APPROVAL E (must be excluded): Dr Cash[Asset] 777777 / Cr Sales[Revenue] 777777
```

Hand-computed expected (posted only):

- Ledger accounts: Cash(Asset) debit 700000 / credit 80000 / balance 620000; Owner Capital(Equity) credit 500000 / balance −500000; Sales(Revenue) credit 200000; Rent(Expense) debit 80000.
- Ledger totals: `debit_cents 780000`, `credit_cents 780000`.
- P&L: `revenue_cents 200000`, `expense_cents 80000`, `net_income_cents 120000`.
- Balance sheet: `assets_cents 620000`, `liabilities_cents 0`, `equity_cents 500000`, `is_balanced false` (net income 120000 not closed to equity — honest for this engine).
- Balanced-only fixture (POSTED A alone): `assets_cents 500000`, `equity_cents 500000`, `is_balanced true`.

---

### Task 1: Engine integrity parity test (backend)

**Files:**

- Create: `backend/__tests__/lib/finance/accountingEngine.integrity.test.js`
- Reference: `backend/lib/finance/accountingEngine.js` (`buildLedger`, `buildProfitAndLoss`, `buildBalanceSheet`)

**Step 1: Write the failing test.** Build the shared fixture as plain entry objects and call the engine directly (no service needed — the engine takes an `entries` array).

```js
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildLedger,
  buildProfitAndLoss,
  buildBalanceSheet,
} from '../../../lib/finance/accountingEngine.js';

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
    // draft/pending excluded → no 999999/777777 leakage
    assert.equal(
      ledger.accounts.some((a) => a.debit_cents >= 999999),
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
```

**Step 2: Run, expect PASS (engine already correct — this LOCKS it).**
Run: `cd backend && node --test __tests__/lib/finance/accountingEngine.integrity.test.js`
Expected: PASS. If any assertion FAILS, that is a real accuracy bug — stop and report it (do not "fix" the test).

**Step 3: Stage (hold).** `git add backend/__tests__/lib/finance/accountingEngine.integrity.test.js`

---

### Task 2: Route parity test — engine output == API response (backend)

**Files:**

- Modify: `backend/__tests__/routes/finance.v2.read-routes.test.js` (append a describe block)
- Reference: `backend/routes/finance.v2.js:200-228` (`/ledger`, `/profit-loss`, `/balance-sheet` pass-through), `backend/lib/finance/financeDomainService.js:713` (`seedJournalEntry`)

**Step 1: Write the failing test.** Seed the fixture via `service.seedJournalEntry`, then assert the route bodies equal the engine output bit-for-bit.

```js
import { buildLedger, buildProfitAndLoss, buildBalanceSheet }
  from '../../lib/finance/accountingEngine.js';

describe('finance.v2 ledger/P&L/balance-sheet — engine parity', () => {
  const T = TENANT_ID;
  const line = (classification, account_name, debit_cents, credit_cents) => ({
    classification, account_name, debit_cents, credit_cents });
  const entry = (status, lines) => ({ tenant_id: T, status, lines });
  const FIXTURE = [
    entry('posted', [line('Asset', 'Cash', 500000, 0), line('Equity', 'Owner Capital', 0, 500000)]),
    entry('posted', [line('Asset', 'Cash', 200000, 0), line('Revenue', 'Sales', 0, 200000)]),
    entry('posted', [line('Expense', 'Rent', 80000, 0), line('Asset', 'Cash', 0, 80000)]),
    entry('draft', [line('Asset', 'Cash', 999999, 0), line('Revenue', 'Sales', 0, 999999)]),
  ];
  function seeded() {
    const service = createFinanceDomainService();
    FIXTURE.forEach((e) => service.seedJournalEntry(e));
    return service;
  }

  test('GET /ledger equals buildLedger(posted entries)', async () => {
    const service = seeded();
    const { app } = buildApp({ service });
    const res = await request(app).get('/api/v2/finance/ledger');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, buildLedger(FIXTURE.map((e) => e)));
  });

  test('GET /profit-loss equals buildProfitAndLoss', async () => {
    const { app } = buildApp({ service: seeded() });
    const res = await request(app).get('/api/v2/finance/profit-loss');
```
