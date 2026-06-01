# Finance Ops Beta Exports (CSV) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add beta-grade CSV export to the read-only Finance Ops panels, serialized from each panel's displayed column model so exports match what users see; PDF deferred.

**Architecture:** Frontend-only. A pure, column-aware serializer (`financeCsv.js`) turns a panel's displayed `columns` + loaded `rows` into labeled records and a CSV string; a small `FinanceCsvExportButton` triggers the browser download. No backend route, no new endpoint, no mutation — export can only contain the already-fetched, tenant-scoped, displayed data.

**Tech Stack:** React 18, Vitest + Testing Library, jsdom.

**⚠️ Commit policy:** **HOLD ALL COMMITS for Codex review.** Each task ends with `git add` (stage only). No `git commit`/push until Codex clears and Andrei authorizes. Final task is a review handoff.

**Reuse note:** `src/components/shared/CsvExportButton.jsx` exists but derives headers from `Object.keys(data[0])` and is not column/label/`render`-aware, so it can't guarantee "export == on-screen" for panels that render transformed values. It stays for generic CRM panels; finance uses the column-aware path below.

---

### Task 1: CSV serializer util

**Files:**

- Create: `src/components/finance/financeCsv.js`
- Test: `src/components/finance/__tests__/financeCsv.test.js`

**Step 1: Write failing tests.**

```js
import { describe, it, expect } from 'vitest';
import { columnsToRecords, recordsToCsv, financeExportFilename } from '../financeCsv';

describe('columnsToRecords', () => {
  it('uses column labels as keys and render() for values, null -> empty', () => {
    const columns = [
      { key: 'id', label: 'ID' },
      {
        key: 'amount_cents',
        label: 'Amount',
        render: (r) => `$${(r.amount_cents / 100).toFixed(2)}`,
      },
      { key: 'memo', label: 'Memo' },
    ];
    const rows = [{ id: 'a1', amount_cents: 120000, memo: null }];
    expect(columnsToRecords(columns, rows)).toEqual([{ ID: 'a1', Amount: '$1200.00', Memo: '' }]);
  });
});

describe('recordsToCsv', () => {
  it('emits header from keys and quotes fields with commas/quotes/newlines', () => {
    const csv = recordsToCsv([
      { A: 'x', B: 'has, comma' },
      { A: 'q"q', B: 'line\nbreak' },
    ]);
    expect(csv).toBe('A,B\nx,"has, comma"\n"q""q","line\nbreak"');
  });
  it('returns empty string for no records', () => {
    expect(recordsToCsv([])).toBe('');
  });
});

describe('financeExportFilename', () => {
  it('builds <area>_<tenantShort>_<date> with no secrets', () => {
    const d = new Date('2026-05-31T12:00:00Z');
    expect(financeExportFilename('draft-invoices', '00000000-0000-4000-8000-000000000011', d)).toBe(
      'finance-draft-invoices_00000000_2026-05-31',
    );
  });
});
```

**Step 2: Run, expect FAIL.**
Run: `npm run test:run -- src/components/finance/__tests__/financeCsv.test.js`

**Step 3: Implement.**

```js
// src/components/finance/financeCsv.js
function valueToString(v) {
  return v === null || v === undefined || v === '' ? '' : String(v);
}

export function columnsToRecords(columns, rows) {
  const cols = Array.isArray(columns) ? columns : [];
  return (Array.isArray(rows) ? rows : []).map((row) =>
    Object.fromEntries(
      cols.map((c) => [c.label, valueToString(c.render ? c.render(row) : row[c.key])]),
    ),
  );
}

function escapeCsv(value) {
  const s = valueToString(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function recordsToCsv(records) {
  if (!Array.isArray(records) || records.length === 0) return '';
  const headers = Object.keys(records[0]);
  const lines = [
    headers.map(escapeCsv).join(','),
    ...records.map((r) => headers.map((h) => escapeCsv(r[h])).join(',')),
  ];
  return lines.join('\n');
}

export function financeExportFilename(area, tenantId, date = new Date()) {
  const short = String(tenantId || '').slice(0, 8) || 'tenant';
  const ymd = date.toISOString().slice(0, 10);
  return `finance-${area}_${short}_${ymd}`;
}

// DOM side-effect; covered by the button test via spies, not unit-tested here.
export function downloadCsv(records, filename) {
  const csv = recordsToCsv(records);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  URL.revokeObjectURL(url);
  if (typeof link.remove === 'function') link.remove();
  else if (link.parentNode) link.parentNode.removeChild(link);
}
```

**Step 4: Run, expect PASS.** **Step 5: Stage.** `git add src/components/finance/financeCsv.js src/components/finance/__tests__/financeCsv.test.js`

---

### Task 2: FinanceCsvExportButton

**Files:**

- Create: `src/components/finance/FinanceCsvExportButton.jsx`
- Test: `src/components/finance/__tests__/FinanceCsvExportButton.test.jsx`

**Step 1: Failing test.**

```jsx
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import FinanceCsvExportButton from '../FinanceCsvExportButton';
import * as csv from '../financeCsv';

afterEach(() => cleanup());

it('enabled with records; click triggers download with area+tenant filename', () => {
  const spy = vi.spyOn(csv, 'downloadCsv').mockImplementation(() => {});
  render(
    <FinanceCsvExportButton records={[{ ID: 'a' }]} area="draft-invoices" tenantId="00000000-x" />,
  );
  const btn = screen.getByTestId('finance-export-draft-invoices');
  expect(btn).not.toBeDisabled();
  fireEvent.click(btn);
  expect(spy).toHaveBeenCalledOnce();
  expect(spy.mock.calls[0][1]).toMatch(/^finance-draft-invoices_00000000_/);
});

it('disabled with explanatory title when no records', () => {
  render(<FinanceCsvExportButton records={[]} area="draft-invoices" tenantId="t" />);
  const btn = screen.getByTestId('finance-export-draft-invoices');
  expect(btn).toBeDisabled();
  expect(btn).toHaveAttribute('title', expect.stringMatching(/nothing to export/i));
});
```

**Step 2: Run, expect FAIL. Step 3: Implement.**

```jsx
// src/components/finance/FinanceCsvExportButton.jsx
import { Button } from '@/components/ui/button';
import { Download } from 'lucide-react';
import { downloadCsv, financeExportFilename } from './financeCsv';

export default function FinanceCsvExportButton({ records, area, tenantId, className = '' }) {
  const empty = !Array.isArray(records) || records.length === 0;
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={empty}
      title={
        empty ? 'Nothing to export — this panel has no rows for the current tenant.' : undefined
      }
      onClick={() => downloadCsv(records, financeExportFilename(area, tenantId))}
      data-testid={`finance-export-${area}`}
      aria-label={`Export ${area} as CSV`}
      className={`border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700 ${className}`}
    >
      <Download className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="ml-1.5 text-xs">Export CSV</span>
    </Button>
  );
}
```

**Step 4: Run, expect PASS. Step 5: Stage.**

---

### Task 3: FinanceTablePanel export (covers the 4 table panels)

**Files:**

- Modify: `src/components/finance/FinanceTablePanel.jsx` (add `exportArea` prop + header button)
- Modify: `src/components/finance/DraftInvoicesPanel.jsx`, `JournalDraftsPanel.jsx`, `ApprovalQueuePanel.jsx`, `AdapterQueuePanel.jsx` (pass `exportArea`)
- Test: `src/components/finance/__tests__/FinanceTablePanel.export.test.jsx`

**Step 1: Failing test** — render `FinanceTablePanel` with a fetcher resolving 1 row + `exportArea`, assert the export button appears and is enabled; with 0 rows assert disabled.

```jsx
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import FinanceTablePanel from '../FinanceTablePanel';

afterEach(() => cleanup());
const columns = [
  { key: 'id', label: 'ID' },
  { key: 'amount_cents', label: 'Amount (cents)' },
];

it('shows an enabled export button when rows load', async () => {
  render(
    <FinanceTablePanel
      tenantId="t"
      testId="x"
      title="X"
      emptyText="none"
      columns={columns}
      exportArea="draft-invoices"
      fetcher={() => Promise.resolve({ invoices: [{ id: 'a', amount_cents: 5 }] })}
      selectRows={(d) => d.invoices}
    />,
  );
  await waitFor(() =>
    expect(screen.getByTestId('finance-export-draft-invoices')).not.toBeDisabled(),
  );
});

it('export button is disabled when no rows', async () => {
  render(
    <FinanceTablePanel
      tenantId="t"
      testId="x"
      title="X"
      emptyText="none"
      columns={columns}
      exportArea="draft-invoices"
      fetcher={() => Promise.resolve({ invoices: [] })}
      selectRows={(d) => d.invoices}
    />,
  );
  await waitFor(() => expect(screen.getByTestId('finance-export-draft-invoices')).toBeDisabled());
});
```

**Step 2: Run, expect FAIL. Step 3: Implement** — in `FinanceTablePanel.jsx` import `FinanceCsvExportButton` + `columnsToRecords`; accept `exportArea`; in the header, next to Refresh, render when `exportArea`:

```jsx
{
  exportArea ? (
    <FinanceCsvExportButton
      records={columnsToRecords(columns, state.rows)}
      area={exportArea}
      tenantId={tenantId}
    />
  ) : null;
}
```

Then add `exportArea="draft-invoices"` / `"journal-drafts"` / `"approvals"` / `"adapter-jobs"` to the four panels.

**Step 4: Run, expect PASS** (also run the panels' existing tests to confirm no regression). **Step 5: Stage.**

---

### Task 4: JournalEntriesList export

**Files:** Modify `src/components/finance/JournalEntriesList.jsx`; Test `src/components/finance/__tests__/JournalEntriesList.export.test.jsx`.

**Step 1: Failing test** — mock `@/api/finance` `getJournalEntries` → 1 entry; assert `finance-export-journal-entries` present + enabled; empty → disabled.
**Step 3: Implement** — render `<FinanceCsvExportButton records={columnsToRecords(COLUMN_DEFS, state.entries)} area="journal-entries" tenantId={tenantId} />` in the header next to Refresh.
**Steps 2/4/5:** fail → pass → stage.

---

### Task 5: AuditTimelinePanel export

**Files:** Modify `src/components/finance/AuditTimelinePanel.jsx`; Test `...__tests__/AuditTimelinePanel.export.test.jsx`.

**Implement** — `<FinanceCsvExportButton records={columnsToRecords(COLUMNS, state.events)} area="audit-events" tenantId={tenantId} />` in the header. Exports the currently-loaded events (incl. Load-more rows). Test present+enabled with rows, disabled when empty.

---

### Task 6: LedgerSummary statement export (packet regression)

**Files:** Modify `src/components/finance/LedgerSummary.jsx`; Test `...__tests__/LedgerSummary.export.test.jsx`.

**Step 1: Failing test** — mock the three GETs (net income 120000, assets 620000, is_balanced false); click export; spy `downloadCsv` and assert the records contain operator labels + `$` amounts and NOT raw `*_cents`:

```jsx
import * as csv from '../financeCsv';
// ...mock ledger/pl/balance-sheet, render, click finance-export-ledger
const records = spy.mock.calls[0][0];
const flat = JSON.stringify(records);
expect(flat).toMatch(/Net income/);
expect(flat).toMatch(/\$1,200\.00/);
expect(flat).not.toMatch(/net_income_cents/);
```

**Step 3: Implement** — build statement records from the already-fetched state using the existing `formatCents`, e.g.:

```jsx
function ledgerStatementRecords({ ledger, profitLoss, balanceSheet }) {
  const rec = (Section, Line, Amount) => ({ Section, Line, Amount });
  const out = [];
  (ledger?.accounts || []).forEach((a) =>
    out.push(
      rec('Ledger', a.account_name || a.account_code || 'Account', formatCents(a.balance_cents)),
    ),
  );
  out.push(rec('Ledger', 'Debits', formatCents(ledger?.totals?.debit_cents)));
  out.push(rec('Ledger', 'Credits', formatCents(ledger?.totals?.credit_cents)));
  out.push(rec('Profit & Loss', 'Revenue', formatCents(profitLoss?.totals?.revenue_cents)));
  out.push(rec('Profit & Loss', 'Expenses', formatCents(profitLoss?.totals?.expense_cents)));
  out.push(rec('Profit & Loss', 'Net income', formatCents(profitLoss?.totals?.net_income_cents)));
  out.push(rec('Balance sheet', 'Assets', formatCents(balanceSheet?.totals?.assets_cents)));
  out.push(
    rec('Balance sheet', 'Liabilities', formatCents(balanceSheet?.totals?.liabilities_cents)),
  );
  out.push(rec('Balance sheet', 'Equity', formatCents(balanceSheet?.totals?.equity_cents)));
  return out;
}
```

Render `<FinanceCsvExportButton records={ledgerStatementRecords(state)} area="ledger" tenantId={tenantId} />` in the header (add a header action row next to Refresh). Disabled when all three are null/empty.

**Steps 2/4/5:** fail → pass (also run existing `LedgerSummary*.test.jsx`) → stage.

---

### Task 7: EvidencePlaceholder pack export (no secrets)

**Files:** Modify `src/components/finance/EvidencePlaceholder.jsx`; Test `...__tests__/EvidencePlaceholder.export.test.jsx`.

**Implement** — build `{ Field, Value }` records from the displayed pack fields only:

```jsx
function evidenceRecords(pack) {
  if (!pack) return [];
  return [
    { Field: 'Pack ID', Value: pack.pack_id ?? '' },
    { Field: 'Generated at', Value: pack.generated_at ?? '' },
    { Field: 'Artifact count', Value: pack.artifact_count ?? '' },
    { Field: 'Pack hash', Value: pack.integrity?.pack_hash ?? '' },
    { Field: 'Events hash', Value: pack.integrity?.events_hash ?? '' },
    { Field: 'Approvals hash', Value: pack.integrity?.approvals_hash ?? '' },
  ];
}
```

Render `<FinanceCsvExportButton records={evidenceRecords(pack)} area="evidence-pack" tenantId={tenantId} />`. **Test:** records contain pack_id + hashes; assert NO key/value matches `/secret|credential|token|api_key|password/i` (secret-safety).

---

### Task 8: Docs + CHANGELOG

**Files:** Modify `docs/architecture/finance/finance-ops-beta-integrity-checklist.md` (§5 Export → Implemented (CSV) with evidence), `docs/architecture/finance/finance-ops-beta-limitations.md` (CSV implemented; PDF deferred; >50-row page cap; `/adapters`+projection no export and why), `CHANGELOG.md`; stage the design doc.

**Step:** edit; then `git add` the docs + `docs/architecture/finance/finance-ops-beta-exports-slice-design.md` + this plan.

---

### Task 9: Full regression + Codex handoff (NO COMMIT)

**Step 1:** `npm run test:run -- src/components/finance src/api/__tests__/finance.test.js` (all green, incl. new export tests + unchanged existing panel tests). `npm run lint` + `npm run format:check` on changed files; `npx prettier --write` any flagged, re-stage.
**Step 2:** `git diff --cached --stat` — only finance components/tests + docs + CHANGELOG; no `src/api/finance.js` change, no backend change, no env/migration. `git status` shows staged, **not committed**.
**Step 3:** Completion report (branch, HEAD, export areas implemented/deferred, files, tests, guardrails) for Codex. **Hold commit/push** until cleared + authorized.
