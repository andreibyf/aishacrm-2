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
import {
  buildLedger,
  buildProfitAndLoss,
  buildBalanceSheet,
} from '../../lib/finance/accountingEngine.js';

describe('finance.v2 ledger/P&L/balance-sheet — engine parity', () => {
  const T = TENANT_ID;
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
    assert.deepEqual(res.body.data, buildProfitAndLoss(FIXTURE));
  });

  test('GET /balance-sheet equals buildBalanceSheet (is_balanced=false)', async () => {
    const { app } = buildApp({ service: seeded() });
    const res = await request(app).get('/api/v2/finance/balance-sheet');
    assert.equal(res.body.data.totals.is_balanced, false);
    assert.deepEqual(res.body.data, buildBalanceSheet(FIXTURE));
  });
});
```

**Step 2: Run, expect PASS.**
Run: `cd backend && node --test __tests__/routes/finance.v2.read-routes.test.js`
Expected: PASS (routes are pass-throughs). A FAIL means engine↔route shape drift — report it.

**Step 3: Stage (hold).** `git add backend/__tests__/routes/finance.v2.read-routes.test.js`

---

### Task 3: LedgerSummary integrity hardening — failing UI test first (frontend)

**Files:**

- Create: `src/components/finance/__tests__/LedgerSummary.integrity.test.jsx`
- Reference: `src/components/finance/LedgerSummary.jsx`, existing test `src/components/finance/__tests__/LedgerSummary.test.jsx` for the mocking pattern of `@/api/finance`.

**Step 1: Write the failing tests.** Mock the three GETs with engine-equivalent JSON. Assert rendered figures, the unbalanced **warning**, and that an absent/failed sheet is NOT shown as "Yes".

```jsx
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import LedgerSummary from '../LedgerSummary';
import * as finance from '@/api/finance';

vi.mock('@/api/finance');
const TENANT = '00000000-0000-4000-8000-000000000011';

beforeEach(() => vi.resetAllMocks());

test('renders net income and assets from source numbers', async () => {
  finance.getLedger.mockResolvedValue({
    accounts: [],
    totals: { debit_cents: 780000, credit_cents: 780000 },
  });
  finance.getProfitLoss.mockResolvedValue({
    revenue_accounts: [],
    expense_accounts: [],
    totals: { revenue_cents: 200000, expense_cents: 80000, net_income_cents: 120000 },
  });
  finance.getBalanceSheet.mockResolvedValue({
    assets: [],
    liabilities: [],
    equity: [],
    totals: {
      assets_cents: 620000,
      liabilities_cents: 0,
      equity_cents: 500000,
      is_balanced: false,
    },
  });
  render(<LedgerSummary tenantId={TENANT} />);
  await waitFor(() => expect(screen.getByText('$1,200.00')).toBeInTheDocument()); // net income
  expect(screen.getByText('$6,200.00')).toBeInTheDocument(); // assets
});

test('unbalanced sheet shows a visible warning, not a bare "No"', async () => {
  finance.getLedger.mockResolvedValue({ accounts: [], totals: {} });
  finance.getProfitLoss.mockResolvedValue({ totals: {} });
  finance.getBalanceSheet.mockResolvedValue({
    assets: [],
    liabilities: [],
    equity: [],
    totals: {
      assets_cents: 620000,
      liabilities_cents: 0,
      equity_cents: 500000,
      is_balanced: false,
    },
  });
  render(<LedgerSummary tenantId={TENANT} />);
  await waitFor(() =>
    expect(screen.getByTestId('ledger-balance-state')).toHaveTextContent(/unbalanced/i),
  );
});

test('absent/failed balance sheet is never shown as balanced', async () => {
  finance.getLedger.mockResolvedValue({ accounts: [], totals: {} });
  finance.getProfitLoss.mockResolvedValue({ totals: {} });
  finance.getBalanceSheet.mockRejectedValue(Object.assign(new Error('boom'), { status: 500 }));
  render(<LedgerSummary tenantId={TENANT} />);
  // section shows an error; no "Balanced: Yes" anywhere
  await waitFor(() =>
    expect(screen.getByTestId('finance-ledger-summary-section-balance-error')).toBeInTheDocument(),
  );
  expect(screen.queryByText('Yes')).not.toBeInTheDocument();
});
```

**Step 2: Run, expect FAIL** (no `ledger-balance-state` testid; current code would render "Yes" via default).
Run: `npm run test:run -- src/components/finance/__tests__/LedgerSummary.integrity.test.jsx`
Expected: FAIL.

**Step 3: Implement the hardening** in `src/components/finance/LedgerSummary.jsx` `BalanceSheetBody`. Replace the `balanced` binary with an explicit three-state, add `data-testid="ledger-balance-state"`:

```jsx
function BalanceSheetBody({ data }) {
  const assets = asArray(data?.assets);
  const liabilities = asArray(data?.liabilities);
  const equity = asArray(data?.equity);
  const totals = data?.totals || {};
  // Three-valued: present+balanced / present+unbalanced / unknown (absent field
  // or no sheet). Never default an absent/failed sheet to "balanced" — that would
  // hide a calculation or load error (beta blocker).
  let balanceLabel;
  let balanceClass;
  if (!data || totals.is_balanced === undefined || totals.is_balanced === null) {
    balanceLabel = 'Unknown';
    balanceClass = 'text-slate-400';
  } else if (totals.is_balanced === false) {
    balanceLabel = 'No — unbalanced (ledger integrity issue)';
    balanceClass = 'text-amber-300 font-semibold';
  } else {
    balanceLabel = 'Yes';
    balanceClass = 'text-slate-100';
  }
  return (
    <div className="space-y-2">
      {assets.length === 0 && liabilities.length === 0 && equity.length === 0 ? (
        <p className="text-xs text-slate-500" data-testid="ledger-section-empty">
          No assets, liabilities, or equity accounts available yet.
        </p>
      ) : null}
      <SummaryRow label="Assets" value={formatCents(totals.assets_cents)} />
      <SummaryRow label="Liabilities" value={formatCents(totals.liabilities_cents)} />
      <SummaryRow label="Equity" value={formatCents(totals.equity_cents)} />
      <div className="flex items-center justify-between py-1.5" data-testid="ledger-balance-state">
        <span className="text-xs text-slate-400">Balanced</span>
        <span className={`text-sm ${balanceClass}`}>{balanceLabel}</span>
      </div>
    </div>
  );
}
```

**Step 4: Run both LedgerSummary suites, expect PASS** (and confirm the existing `LedgerSummary.test.jsx` still passes — if it asserted the old "No" text, update that assertion to the new label).
Run: `npm run test:run -- src/components/finance/__tests__/LedgerSummary.integrity.test.jsx src/components/finance/__tests__/LedgerSummary.test.jsx`
Expected: PASS.

**Step 5: Stage (hold).** `git add src/components/finance/LedgerSummary.jsx src/components/finance/__tests__/LedgerSummary.integrity.test.jsx src/components/finance/__tests__/LedgerSummary.test.jsx`

---

### Task 4: Beta-integrity checklist doc

**Files:**

- Create: `docs/architecture/finance/finance-ops-beta-integrity-checklist.md`

**Step 1:** Write the checklist: for each of the 4 principles (Accuracy, Consistency, Immutability, Accountability) list enforcement point(s) with `file:line` refs and the test evidence from Tasks 1–3, plus an honest **Implemented / Partial / Deferred** marker. Mark Export as **Deferred (next slice)**. Note immutability is **Partial**: ledger counts only posted/reversed (`accountingEngine.js:76-80`), no UI/API edit path for posted records (`src/api/finance.js` GET-only), but persistent immutability storage is deferred.

**Step 2: Stage (hold).** `git add docs/architecture/finance/finance-ops-beta-integrity-checklist.md`

---

### Task 5: Beta-limitations doc

**Files:**

- Create: `docs/architecture/finance/finance-ops-beta-limitations.md`

**Step 1:** Document explicit deferrals with refs: in-memory persistence (`buildSource mode:'in_memory'`), `runtime.mode` placeholder gap (`src/api/finance.js` §8.2.9), projection/cursors deferred (`FINANCE_API_GAPS.projectionCursors`), persistent-events route lift deferred (`finance.v2.js:48` fail-closed), provider writes default-closed (`adapterJobProcessor.js:332-345`), CSV/PDF export = next slice.

**Step 2: Stage (hold).** `git add docs/architecture/finance/finance-ops-beta-limitations.md`

---

### Task 6: CHANGELOG + design doc

**Files:**

- Modify: `CHANGELOG.md` (under `## [Unreleased]`)
- Stage: `docs/architecture/finance/finance-ops-beta-integrity-slice-design.md` (already written)

**Step 1:** Add a `### Added` / `### Changed` entry: integrity parity tests (engine/route/UI), `LedgerSummary` three-valued balance state, beta-integrity checklist + limitations docs.

**Step 2: Stage (hold).** `git add CHANGELOG.md docs/architecture/finance/finance-ops-beta-integrity-slice-design.md`

---

### Task 7: Full regression + Codex review handoff (NO COMMIT)

**Step 1: Run the full finance suites.**

- `cd backend && npm test` (or scoped: `node --test __tests__/lib/finance/ __tests__/routes/finance.v2.read-routes.test.js`)
- `npm run test:run -- src/components/finance src/api/__tests__/finance.test.js`
- `npm run lint` + `npm run format:check` on changed files.
  Expected: all green; lint/format clean.

**Step 2: Verify guardrails** — `git diff --stat` shows only tests + `LedgerSummary.jsx` + docs + CHANGELOG; no route mutation, no env flips, no migration. Confirm `git status` (staged, **not committed**).

**Step 3: Handoff.** Produce a completion report (branch, files, endpoints touched = none, tests + results, guardrail posture) for Codex review. **Do not commit or push.** Hold for Codex clearance + Andrei authorization, then commit on explicit go.
