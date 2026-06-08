# System-Account Rename + Per-Panel PDF Export — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Allow system/seeded COA accounts to be renamed (name + type, classification/code locked, reason required) and add a per-panel client-side PDF export alongside the existing CSV export.

**Architecture:** Feature A generalizes the existing posted-history field-lock in `financeDomainService.updateAccount` so system accounts share it (no parallel special-case); the frontend enables the Edit affordance for system rows. Feature B adds a `jsPDF` helper + button mirroring the CSV export's displayed-column posture, surfaced via a shared `FinanceExportButtons` wrapper at all 7 export call sites.

**Tech Stack:** Node.js native test runner (backend), Vitest + Testing Library (frontend), `jspdf` + `jspdf-autotable` (new client deps). Design: `docs/plans/2026-06-07-finance-coa-rename-and-pdf-export-design.md`.

**Guardrail:** NO env-var changes (`ENABLE_FINANCE_PERSISTENT_EVENTS`/`FINANCE_PROVIDER_WRITES_ENABLED`/`finance_data_mode` stay sandbox). No external-integration code. No migration.

**Branch:** `feat/finance-coa-rename-and-pdf-export` (already created; design doc committed).

---

## Feature A — System-account rename

### Task 1: Backend — generalize the field-lock so system accounts allow name + type

**Files:**
- Modify: `backend/lib/finance/financeDomainService.js` (`updateAccount`, ~lines 1491–1527)
- Test: `backend/__tests__/lib/finance/financeDomainService.coa-manager.test.js`

**Step 1: Write the failing tests**

Add to the COA-manager suite. Get a seeded system account by listing accounts and picking `is_system`:

```js
test('updateAccount: a SYSTEM account can be renamed (name) with a reason; stays system, code/classification unchanged (system-rename design 2026-06-07)', async () => {
  const service = createFinanceDomainService();
  const sys = service.listAccounts(TENANT).find((a) => a.is_system);
  assert.ok(sys, 'a baseline system account exists');
  const before = { code: sys.account_code, classification: sys.classification };

  const updated = await service.updateAccount({
    tenantId: TENANT, actor, accountId: sys.id,
    payload: { name: `${sys.name} (Operating)`, reason: 'beta display rename' },
  });

  assert.equal(updated.name, `${sys.name} (Operating)`);
  assert.equal(updated.is_system, true);
  assert.equal(updated.account_code, before.code);
  assert.equal(updated.classification, before.classification);
});

test('updateAccount: a SYSTEM account account_type change (valid for its classification) with a reason succeeds', async () => {
  const service = createFinanceDomainService();
  const sys = service.listAccounts(TENANT).find((a) => a.is_system && a.classification === 'Asset');
  const updated = await service.updateAccount({
    tenantId: TENANT, actor, accountId: sys.id,
    payload: { account_type: 'Bank', reason: 'mark as bank' },
  });
  assert.equal(updated.account_type, 'Bank');
});

test('updateAccount: a SYSTEM account REJECTS a classification or code change (FINANCE_COA_FIELD_LOCKED_SYSTEM)', async () => {
  const service = createFinanceDomainService();
  const sys = service.listAccounts(TENANT).find((a) => a.is_system);
  await assert.rejects(
    () => service.updateAccount({ tenantId: TENANT, actor, accountId: sys.id, payload: { account_code: '9999', reason: 'x' } }),
    (e) => e.statusCode === 409 && e.code === 'FINANCE_COA_FIELD_LOCKED_SYSTEM',
  );
});

test('updateAccount: a SYSTEM account rename with a BLANK reason is rejected (FINANCE_COA_REASON_REQUIRED)', async () => {
  const service = createFinanceDomainService();
  const sys = service.listAccounts(TENANT).find((a) => a.is_system);
  await assert.rejects(
    () => service.updateAccount({ tenantId: TENANT, actor, accountId: sys.id, payload: { name: `${sys.name} X` } }),
    (e) => e.statusCode === 400 && e.code === 'FINANCE_COA_REASON_REQUIRED',
  );
});

test('updateAccount: a SYSTEM account still CANNOT be deactivated (FINANCE_COA_SYSTEM_ACCOUNT_LOCKED)', async () => {
  const service = createFinanceDomainService();
  const sys = service.listAccounts(TENANT).find((a) => a.is_system);
  await assert.rejects(
    () => service.deactivateAccount({ tenantId: TENANT, actor, accountId: sys.id, payload: { reason: 'x' } }),
    (e) => e.statusCode === 409 && e.code === 'FINANCE_COA_SYSTEM_ACCOUNT_LOCKED',
  );
});

test('updateAccount: an AI actor still cannot edit a SYSTEM account (FINANCE_COA_AI_FORBIDDEN)', async () => {
  const service = createFinanceDomainService();
  const sys = service.listAccounts(TENANT).find((a) => a.is_system);
  await assert.rejects(
    () => service.updateAccount({ tenantId: TENANT, actor: { id: 'bot', type: 'ai_agent' }, accountId: sys.id, payload: { name: 'X', reason: 'x' } }),
    (e) => e.statusCode === 403 && e.code === 'FINANCE_COA_AI_FORBIDDEN',
  );
});
```

(Confirm `TENANT`/`actor` constants + `createFinanceDomainService` import match the file's existing top-of-file setup; reuse them.)

**Step 2: Run to verify they fail**

Run: `cd backend && node --test --test-name-pattern="SYSTEM account" __tests__/lib/finance/financeDomainService.coa-manager.test.js`
Expected: FAIL — system rename currently rejected with `FINANCE_COA_SYSTEM_ACCOUNT_LOCKED` (the rename/type tests fail; the deactivate + AI tests should already pass).

**Step 3: Implement — generalize the lock**

In `updateAccount`, **delete** the step-3 hard system reject:

```js
// 3. System accounts are fully locked — no field is editable (design §2).
if (current.is_system) {
  const e = new Error('System accounts cannot be edited.');
  e.statusCode = 409;
  e.code = 'FINANCE_COA_SYSTEM_ACCOUNT_LOCKED';
  throw e;
}
```

Replace the step-4 posted-history block with the generalized version:

```js
// 4. Field-lock rules (design §2; system-rename design 2026-06-07). SYSTEM accounts
// AND posted-history accounts both lock classification + account_code and require a
// reason — the only difference is a system account can never be deactivated (enforced
// in deactivateAccount). Generalize rather than add a parallel system-account branch.
const posted = hasPostedHistory(bucket, accountId);
const codeClassLocked = current.is_system || posted;
const reasonRequired = current.is_system || posted;
if (codeClassLocked && (classificationChanged || codeChanged)) {
  const e = new Error(
    current.is_system
      ? 'Classification and account_code are locked on a system account.'
      : 'Classification and account_code are locked on an account with posted history.',
  );
  e.statusCode = 409;
  e.code = current.is_system
    ? 'FINANCE_COA_FIELD_LOCKED_SYSTEM'
    : 'FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY';
  throw e;
}
if (reasonRequired && anyChange && String(payload.reason ?? '').trim() === '') {
  const e = new Error('A reason is required to edit this account.');
  e.statusCode = 400;
  e.code = 'FINANCE_COA_REASON_REQUIRED';
  throw e;
}
```

(Step 6's `{ ...current, ... }` snapshot already preserves `is_system`/`is_active`/`source`. `deactivateAccount`/`reactivateAccount` keep their existing `is_system` reject — do NOT touch them.)

**Step 4: Run to verify pass**

Run: `cd backend && node --test __tests__/lib/finance/financeDomainService.coa-manager.test.js`
Expected: PASS (all, incl. unchanged posted-history/no-history regressions).

**Step 5: Commit**

```bash
git add backend/lib/finance/financeDomainService.js backend/__tests__/lib/finance/financeDomainService.coa-manager.test.js
git commit -m "feat(finance): allow system-account rename (generalize the posted-history field-lock)"
```

---

### Task 2: Frontend — Edit affordance for system rows + generalized lock

**Files:**
- Modify: `src/components/finance/ChartOfAccountsPanel.jsx` (`AccountRow` ~371–446, `EditAccountRow` ~451–476, `COA_ERROR_MESSAGES` ~73–90, helper copy ~166)
- Test: `src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx`

**Step 1: Write the failing tests**

```jsx
it('shows an Edit affordance for a SYSTEM account row (rename is allowed)', async () => {
  finance.getAccounts.mockResolvedValue({
    accounts: [{ id: 'sys1', account_code: '1000', name: 'Cash', classification: 'Asset', account_type: 'Cash', is_system: true, is_active: true, has_posted_history: true }],
  });
  render(<ChartOfAccountsPanel tenantId={TENANT} />);
  expect(await screen.findByTestId('coa-edit-sys1')).toBeInTheDocument();
  // no deactivate control for a system account
  expect(screen.queryByTestId('coa-deactivate-sys1')).not.toBeInTheDocument();
});

it('locks classification + code and requires a reason when editing a SYSTEM account', async () => {
  finance.getAccounts.mockResolvedValue({
    accounts: [{ id: 'sys1', account_code: '1000', name: 'Cash', classification: 'Asset', account_type: 'Cash', is_system: true, is_active: true, has_posted_history: false }],
  });
  render(<ChartOfAccountsPanel tenantId={TENANT} />);
  fireEvent.click(await screen.findByTestId('coa-edit-sys1'));
  expect(screen.getByTestId('coa-edit-classification-sys1')).toBeDisabled();
  expect(screen.getByTestId('coa-edit-code-sys1')).toBeDisabled();
  expect(screen.getByTestId('coa-edit-reason-sys1')).toBeInTheDocument();
});
```

(Match the file's existing test imports — `finance.getAccounts` mock, `TENANT`, `render`, `screen`, `fireEvent`, `findByTestId`.)

**Step 2: Run to verify fail**

Run: `npx vitest run src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx`
Expected: FAIL — system row renders "Locked", no `coa-edit-sys1`.

**Step 3: Implement**

In `AccountRow`, compute the shared predicates and allow editing system rows:

```jsx
const isSystem = Boolean(account.is_system);
const hasHistory = Boolean(account.has_posted_history);
const isActive = account.is_active !== false;
const fieldsLocked = isSystem || hasHistory;     // classification + code disabled
const reasonRequired = isSystem || hasHistory;   // reason input shown + required

if (isEditing) {
  return (
    <EditAccountRow
      account={account}
      busy={busy}
      fieldsLocked={fieldsLocked}
      reasonRequired={reasonRequired}
      onCancel={onCancel}
      onSave={onSave}
    />
  );
}
```

Replace the actions cell so system rows get an Edit button but no deactivate:

```jsx
<td className="py-1.5 pr-3 text-slate-100">
  <div className="flex items-center gap-2">
    <button
      type="button"
      onClick={onEdit}
      disabled={busy}
      data-testid={`coa-edit-${account.id}`}
      className="text-sky-300 hover:underline disabled:opacity-50"
    >
      Edit
    </button>
    {isSystem ? (
      <span className="text-xs text-slate-500" data-testid={`coa-row-system-${account.id}`}>System</span>
    ) : isActive ? (
      <ReasonAction account={account} busy={busy} action="deactivate" label="Deactivate" onConfirm={onDeactivate} />
    ) : (
      <ReasonAction account={account} busy={busy} action="reactivate" label="Reactivate" onConfirm={onReactivate} />
    )}
  </div>
</td>
```

In `EditAccountRow`, swap the `hasHistory` param for `fieldsLocked` + `reasonRequired`:

```jsx
function EditAccountRow({ account, busy, fieldsLocked, reasonRequired, onCancel, onSave }) {
  // ...state unchanged...
  function onSubmit(e) {
    e.preventDefault();
    const payload = { name, account_type: accountType };
    if (!fieldsLocked) {
      payload.classification = classification;
      payload.account_code = code;
    }
    if (reason.trim() !== '') payload.reason = reason.trim();
    onSave(payload);
  }
  // classification <select> disabled={fieldsLocked}
  // account code <input> disabled={fieldsLocked}
  // reason <label> rendered when reasonRequired (was hasHistory)
}
```

Add to `COA_ERROR_MESSAGES`:

```js
FINANCE_COA_FIELD_LOCKED_SYSTEM: 'Classification and code are locked on a system account.',
```

Amend the panel helper copy (~line 166):

```jsx
System accounts keep their classification and code; name and type can be changed with a reason. The server enforces every rule.
```

**Step 4: Run to verify pass**

Run: `npx vitest run src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx`
Expected: PASS (incl. existing non-system + create/lock/toggle tests).

**Step 5: Commit**

```bash
git add src/components/finance/ChartOfAccountsPanel.jsx src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx
git commit -m "feat(finance): enable system-account rename in the COA manager UI"
```

---

## Feature B — Per-panel PDF export

### Task 3: Add the jsPDF dependencies

**Files:** Modify: `package.json` (root frontend)

**Step 1:** Run: `npm install jspdf jspdf-autotable`
**Step 2:** Verify both appear under `dependencies` in `package.json`; `npm ls jspdf jspdf-autotable` resolves.
**Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(finance): add jspdf + jspdf-autotable for PDF export"
```

---

### Task 4: `financePdf.js` helper

**Files:**
- Create: `src/components/finance/financePdf.js`
- Test: `src/components/finance/__tests__/financePdf.test.js`

**Step 1: Write the failing test**

```js
import { describe, it, expect, vi, afterEach } from 'vitest';

const save = vi.fn();
const text = vi.fn();
const autoTable = vi.fn();
vi.mock('jspdf', () => ({ jsPDF: vi.fn(() => ({ save, text })) }));
vi.mock('jspdf-autotable', () => ({ default: autoTable }));

import { downloadPdf } from '../financePdf';

afterEach(() => vi.clearAllMocks());

describe('financePdf.downloadPdf', () => {
  it('renders records as a table (label header + displayed cells) and saves <filename>.pdf', () => {
    downloadPdf(
      [{ Code: '1000', Name: 'Cash' }, { Code: '1050', Name: 'Bank' }],
      'finance-chart-of-accounts_00000000_2026-06-07',
      { title: 'Chart of accounts' },
    );
    expect(autoTable).toHaveBeenCalledOnce();
    const opts = autoTable.mock.calls[0][1];
    expect(opts.head).toEqual([['Code', 'Name']]);
    expect(opts.body).toEqual([['1000', 'Cash'], ['1050', 'Bank']]);
    expect(save).toHaveBeenCalledWith('finance-chart-of-accounts_00000000_2026-06-07.pdf');
  });

  it('is a no-op for empty/invalid records', () => {
    downloadPdf([], 'x');
    downloadPdf(null, 'x');
    expect(autoTable).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
});
```

**Step 2: Run to verify fail**

Run: `npx vitest run src/components/finance/__tests__/financePdf.test.js`
Expected: FAIL — `../financePdf` not found.

**Step 3: Implement**

```js
/**
 * Finance Ops PDF export helper (Beta Exports slice — PDF follow-up).
 *
 * Client-side PDF of a panel's displayed rows, sibling to financeCsv.js. Takes the
 * SAME `columnsToRecords` output (label -> displayed cell, '—' for empty) so the PDF
 * matches the on-screen table. Pure client-side: no backend, no new endpoint, no
 * secrets, displayed-page only. Mirrors downloadCsv's posture.
 */
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Download labeled records as a table PDF. Header = the first record's keys (column
 * labels); each body row = that record's values. Empty input is a no-op (the button
 * is disabled upstream). `filename` is the base; `.pdf` is appended.
 */
export function downloadPdf(records, filename, { title } = {}) {
  if (!Array.isArray(records) || records.length === 0) return;
  const headers = Object.keys(records[0]);
  const body = records.map((r) => headers.map((h) => r[h]));
  const doc = new jsPDF({ orientation: 'landscape' });
  if (title) doc.text(String(title), 14, 14);
  autoTable(doc, { head: [headers], body, startY: title ? 20 : 14, styles: { fontSize: 8 } });
  doc.save(`${filename}.pdf`);
}
```

**Step 4: Run to verify pass**

Run: `npx vitest run src/components/finance/__tests__/financePdf.test.js`
Expected: PASS.

**Step 5: Commit**

```bash
git add src/components/finance/financePdf.js src/components/finance/__tests__/financePdf.test.js
git commit -m "feat(finance): financePdf.downloadPdf helper (client-side table PDF)"
```

---

### Task 5: `FinancePdfExportButton` component

**Files:**
- Create: `src/components/finance/FinancePdfExportButton.jsx`
- Test: `src/components/finance/__tests__/FinancePdfExportButton.test.jsx`

**Step 1: Write the failing test** (mirror `FinanceCsvExportButton.test.jsx`)

```jsx
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import FinancePdfExportButton from '../FinancePdfExportButton';
import * as pdf from '../financePdf';

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('FinancePdfExportButton', () => {
  it('enables with records and triggers a PDF download with the area+tenant filename', () => {
    const spy = vi.spyOn(pdf, 'downloadPdf').mockImplementation(() => {});
    render(<FinancePdfExportButton records={[{ Code: '1000' }]} area="chart-of-accounts" tenantId="00000000-0000-4000-8000-000000000011" title="Chart of accounts" />);
    const button = screen.getByTestId('finance-pdf-chart-of-accounts');
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(spy).toHaveBeenCalledOnce();
    expect(spy.mock.calls[0][1]).toMatch(/^finance-chart-of-accounts_00000000_/);
    expect(spy.mock.calls[0][2]).toEqual({ title: 'Chart of accounts' });
  });

  it('disables with an explanatory title when there are no records', () => {
    render(<FinancePdfExportButton records={[]} area="chart-of-accounts" tenantId="00000000-0000-4000-8000-000000000011" />);
    const button = screen.getByTestId('finance-pdf-chart-of-accounts');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', expect.stringMatching(/nothing to export/i));
  });
});
```

**Step 2: Run to verify fail** — `npx vitest run src/components/finance/__tests__/FinancePdfExportButton.test.jsx` → FAIL (module not found).

**Step 3: Implement**

```jsx
import { FileText } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { financeExportFilename } from './financeCsv';
import { downloadPdf } from './financePdf';

export default function FinancePdfExportButton({ records, area, tenantId, title, className = '' }) {
  const empty = !Array.isArray(records) || records.length === 0;

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={empty}
      title={empty ? 'Nothing to export — this panel has no rows for the current tenant.' : undefined}
      onClick={() => downloadPdf(records, financeExportFilename(area, tenantId), { title })}
      data-testid={`finance-pdf-${area}`}
      aria-label={`Export ${area} as PDF`}
      className={`border-slate-600 bg-slate-800/60 text-slate-100 hover:bg-slate-700 ${className}`.trim()}
    >
      <FileText className="h-3.5 w-3.5" aria-hidden="true" />
      <span className="ml-1.5 text-xs">Export PDF</span>
    </Button>
  );
}
```

**Step 4: Run to verify pass** — same command → PASS.

**Step 5: Commit**

```bash
git add src/components/finance/FinancePdfExportButton.jsx src/components/finance/__tests__/FinancePdfExportButton.test.jsx
git commit -m "feat(finance): FinancePdfExportButton (sibling to the CSV export button)"
```

---

### Task 6: `FinanceExportButtons` wrapper (DRY for the 7 call sites)

**Files:**
- Create: `src/components/finance/FinanceExportButtons.jsx`
- Test: `src/components/finance/__tests__/FinanceExportButtons.test.jsx`

**Step 1: Write the failing test**

```jsx
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import FinanceExportButtons from '../FinanceExportButtons';

afterEach(() => cleanup());

describe('FinanceExportButtons', () => {
  it('renders both the CSV and PDF export buttons for an area', () => {
    render(<FinanceExportButtons records={[{ Code: '1000' }]} area="chart-of-accounts" tenantId="00000000-0000-4000-8000-000000000011" title="Chart of accounts" />);
    expect(screen.getByTestId('finance-export-chart-of-accounts')).toBeInTheDocument();
    expect(screen.getByTestId('finance-pdf-chart-of-accounts')).toBeInTheDocument();
  });
});
```

**Step 2: Run to verify fail** — `npx vitest run src/components/finance/__tests__/FinanceExportButtons.test.jsx` → FAIL.

**Step 3: Implement**

```jsx
import FinanceCsvExportButton from './FinanceCsvExportButton';
import FinancePdfExportButton from './FinancePdfExportButton';

// Renders the CSV + PDF export pair for a panel. Both serialize the SAME precomputed
// `records` (the panel's displayed columns) — read-only, displayed-page only.
export default function FinanceExportButtons({ records, area, tenantId, title, className = '' }) {
  return (
    <div className="flex items-center gap-2">
      <FinanceCsvExportButton records={records} area={area} tenantId={tenantId} className={className} />
      <FinancePdfExportButton records={records} area={area} tenantId={tenantId} title={title} className={className} />
    </div>
  );
}
```

**Step 4: Run to verify pass** — same command → PASS.

**Step 5: Commit**

```bash
git add src/components/finance/FinanceExportButtons.jsx src/components/finance/__tests__/FinanceExportButtons.test.jsx
git commit -m "feat(finance): FinanceExportButtons wrapper (CSV + PDF pair)"
```

---

### Task 7: Wire `FinanceExportButtons` into all 7 export call sites

**Files (each: replace the `<FinanceCsvExportButton .../>` usage with `<FinanceExportButtons ... title="<panel title>"/>` and swap the import):**
- `src/components/finance/ChartOfAccountsPanel.jsx:180` (title `"Chart of accounts"`)
- `src/components/finance/FinanceTablePanel.jsx:76` (title = the panel's `title` prop)
- `src/components/finance/JournalEntriesList.jsx:81` (title `"Journal entries"`)
- `src/components/finance/AuditTimelinePanel.jsx:74` (title `"Audit timeline"`)
- `src/components/finance/CashFlowStatementPanel.jsx:81` (title `"Cash flow"`)
- `src/components/finance/LedgerSummary.jsx:244` (title `"Ledger summary"`)
- `src/components/finance/EvidencePlaceholder.jsx:95` (title `"Evidence"`)

For each: replace `import FinanceCsvExportButton from './FinanceCsvExportButton';` with `import FinanceExportButtons from './FinanceExportButtons';`, and the element `<FinanceCsvExportButton records={...} area={...} tenantId={...} />` with `<FinanceExportButtons records={...} area={...} tenantId={...} title="..." />` (keep the existing `records`/`area`/`tenantId` expressions verbatim).

**Step 1: Verify existing CSV tests still pass (the CSV button keeps its `finance-export-<area>` testid inside the wrapper).**

Run: `npx vitest run src/components/finance/__tests__/FinanceTablePanel.export.test.jsx src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx`
Expected: PASS (CSV buttons still present via the wrapper).

**Step 2: Add a PDF-present assertion to one panel test (ChartOfAccountsPanel.test.jsx)**

```jsx
it('exposes a PDF export alongside the CSV export', async () => {
  await renderWith(ALL); // existing helper
  expect(screen.getByTestId('finance-pdf-chart-of-accounts')).toBeInTheDocument();
});
```

**Step 3: Run the full finance frontend suite**

Run: `npx vitest run src/components/finance`
Expected: PASS.

**Step 4: Commit**

```bash
git add src/components/finance/*.jsx src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx
git commit -m "feat(finance): surface PDF export alongside CSV on every finance panel"
```

---

### Task 8: Docs

**Files:**
- Modify: `docs/architecture/finance/finance-ops-IMPLEMENTATION-STATUS.md` (§6 export set now CSV+PDF; §9 drop "PDF export" from deferred, note system-rename done)
- Modify: `docs/architecture/finance/finance-ops-beta-limitations.md` (mark #7b PDF implemented; amend #10 residual (a) system-rename retired)
- Modify: `CHANGELOG.md` (`### Added` PDF export; `### Changed` system-account rename via generalized field-lock)

**Step 1:** Make the edits (prose; cite `FINANCE_COA_FIELD_LOCKED_SYSTEM`, `jspdf`/`jspdf-autotable`, `FinanceExportButtons`).
**Step 2: Commit** (docs-only → `--no-verify` per the hooks-stall convention)

```bash
git add docs/architecture/finance/finance-ops-IMPLEMENTATION-STATUS.md docs/architecture/finance/finance-ops-beta-limitations.md CHANGELOG.md
git commit --no-verify -m "docs(finance): system-account rename + PDF export — status, limitations, changelog"
```

---

### Task 9: Full regression + open PR

**Step 1:** Backend finance suite — `cd backend && node --test $(ls __tests__/lib/finance/*.test.js) __tests__/routes/finance.v2.coa-routes.test.js` → all PASS.
**Step 2:** Frontend finance suite — `npx vitest run src/components/finance` → all PASS.
**Step 3:** Lint — `npm run lint` (or rely on the pre-commit lint-staged gate on the non-docs commits).
**Step 4:** Push + open PR:

```bash
git push -u github feat/finance-coa-rename-and-pdf-export
gh pr create --base main --title "feat(finance): system-account rename + per-panel PDF export" --body "<summary + links to both design docs; notes env vars unchanged / external integration deferred>"
```

**Step 5:** Report PR URL; do not merge until reviewed.

---

## Notes
- DRY: Feature A reuses the posted-history lock path; Feature B routes all panels through one `FinanceExportButtons` wrapper.
- YAGNI: no separate `financePdfFilename` (reuse `financeExportFilename`); no fetch-all; no server endpoint.
- TDD: every code task writes the failing test first.
- Guardrail re-check before PR: `git diff main -- '*.env*' docker-compose*.yml` should be empty — no env/flag changes.
