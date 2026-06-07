# Finance Ops — System-Account Rename + Per-Panel PDF Export (Design)

**Date:** 2026-06-07
**Status:** Approved (brainstorm) → ready for implementation plan
**Scope owner:** Dre

## Purpose

Implement two remaining deferred Finance Ops **features** so the module is code-complete for
production, while leaving all activation env vars at their **sandbox defaults**. This explicitly
**excludes** external accounting-system integration (provider live writes, QuickBooks/Xero/NetSuite,
provider COA mapping) — that stays deferred.

The two features:

1. **System/seeded-account rename** — retire the COA-manager residual "system/seeded accounts still
   locked from rename" (`finance-ops-beta-limitations.md` #10 residual (a)).
2. **Per-panel PDF export** — retire beta limitation **#7b** ("PDF export deferred — CSV is the beta
   recordkeeping export").

### Decisions taken during brainstorm (locked)

| Question | Decision |
| --- | --- |
| Granular `finance.accounts.manage` RBAC capability | **Dropped.** Keep the existing admin/superadmin gate (`requireCoaManage`). The repo has no capability system; building one is RBAC infrastructure, not a finance feature. |
| What becomes editable on a system account | **Name + `account_type`**, with classification + `account_code` locked and a **reason required** (generalize the posted-history rule). |
| PDF export approach | **Client-side `jsPDF`** (mirrors the CSV posture: displayed columns only, no backend, no secrets). |
| CSV full-history (fetch-all) | **Dropped.** Export stays displayed-page only. |

## Guardrails (both features)

- **No env-var changes.** `ENABLE_FINANCE_PERSISTENT_EVENTS=false`, `FINANCE_PROVIDER_WRITES_ENABLED=false`,
  `finance_data_mode=test` all unchanged. Neither feature is gated by these kill switches, so both run
  in the default in-memory/sandbox mode — the intended "code-complete, not activated" posture.
- Purely additive; no migration, no new persistent state, no provider behavior.
- COA mutation surface stays **human-only** (`ai_agent` → `403 FINANCE_COA_AI_FORBIDDEN`) and
  **admin/superadmin-gated** (`requireCoaManage`) — unchanged.

---

## Feature A — System/seeded-account rename

### Current behavior

`financeDomainService.updateAccount` step 3 hard-rejects any system account:

```js
if (current.is_system) {
  // → 409 FINANCE_COA_SYSTEM_ACCOUNT_LOCKED
}
```

System accounts (Cash 1000, Bank 1050, AR, AP, Retained Earnings, Revenue, Expenses, Uncategorized) are
therefore fully uneditable. The frontend renders no Edit affordance for system rows.

### Target behavior — generalize the posted-history lock (altitude: no special-case)

A system account becomes editable under the **same field-lock rule already enforced for posted-history
accounts**, plus two system-only invariants (stays `is_system`, can't be deactivated):

| Field | System account | Posted-history account | No-history account |
| --- | --- | --- | --- |
| `name` | editable (reason required) | editable (reason required) | editable |
| `account_type` | editable, re-validated vs locked classification (reason required) | editable (reason required) | editable |
| `classification` | **locked** | **locked** | editable |
| `account_code` | **locked** | **locked** | editable |
| `is_system` / `is_active` | unchanged; deactivate blocked | n/a | n/a |

### Backend changes (`backend/lib/finance/financeDomainService.js`)

In `updateAccount`:

1. **Remove** the hard system reject at step 3.
2. Introduce two derived predicates after locating `current` and computing `posted`:
   - `const codeClassLocked = current.is_system || posted;`
   - `const reasonRequired = current.is_system || posted;`
3. Replace the posted-only field-lock check with the generalized one:
   - If `codeClassLocked && (classificationChanged || codeChanged)` → reject. Use a **new code**
     `FINANCE_COA_FIELD_LOCKED_SYSTEM` when `current.is_system` (more accurate operator message), else
     the existing `FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY`.
   - If `reasonRequired && anyChange && reason is blank` → `FINANCE_COA_REASON_REQUIRED` (unchanged code).
4. Steps 5–6 (effective-value validation, uniqueness, merged snapshot) are unchanged — they already
   operate on the merged result, and `is_system` / `is_active` / `source` are preserved by the
   `{ ...current, ... }` spread (only `name` / `account_type` can actually change for a system account
   because classification/code are locked above).
5. `deactivateAccount` / `reactivateAccount` keep their existing `is_system` hard reject
   (`FINANCE_COA_SYSTEM_ACCOUNT_LOCKED`) — **unchanged**. A system account is renamable, never
   deactivatable.

New error code: **`FINANCE_COA_FIELD_LOCKED_SYSTEM`** (409). `FINANCE_COA_SYSTEM_ACCOUNT_LOCKED` is
retained, now meaning specifically "system accounts cannot be deactivated."

### Frontend changes (`src/components/finance/ChartOfAccountsPanel.jsx`)

- Render the **Edit** affordance for system rows (today hidden). Keep Deactivate hidden for system rows.
- In the edit form, drive the disabled state off a single predicate
  `fieldsLocked = account.is_system || account.has_posted_history` for classification + account_code
  (replaces the posted-history-only check), and `reasonRequired = same`.
- Add `FINANCE_COA_FIELD_LOCKED_SYSTEM` to `COA_ERROR_MESSAGES` ("Classification and code are locked on
  a system account.").
- Copy tweak: the panel's helper text already says "System accounts are locked" — amend to "System
  accounts keep their classification and code; name and type can be changed with a reason."

### Tests (`backend/__tests__/lib/finance/financeDomainService.coa-manager.test.js`)

- system account: rename (name) with reason → succeeds; `is_system` still true, code/classification unchanged.
- system account: `account_type` change (valid for classification) with reason → succeeds.
- system account: classification change → `409 FINANCE_COA_FIELD_LOCKED_SYSTEM`.
- system account: `account_code` change → `409 FINANCE_COA_FIELD_LOCKED_SYSTEM`.
- system account: any change with blank reason → `400 FINANCE_COA_REASON_REQUIRED`.
- system account: deactivate still → `409 FINANCE_COA_SYSTEM_ACCOUNT_LOCKED`.
- system account: `ai_agent` actor still → `403 FINANCE_COA_AI_FORBIDDEN`.
- Regression: posted-history and no-history paths unchanged.

Frontend (`ChartOfAccountsPanel.test.jsx`): a system row shows Edit; in edit mode classification +
account_code are disabled and reason is required; saving a name change calls `updateAccount`.

---

## Feature B — Per-panel PDF export (client-side `jsPDF`)

### Posture (identical to the existing CSV export)

Built only from each panel's already-displayed `columns` + `rows` (via the existing
`columnsToRecords`), tenant-scoped, read-only, no backend, no new endpoint, no secrets, **displayed
page only**. PDF is a sibling output format to CSV, not a new data path.

### Dependencies

Add to the frontend `package.json`: **`jspdf`** + **`jspdf-autotable`** (table rendering). Client-only;
no backend dependency.

### New helper — `src/components/finance/financePdf.js`

Mirrors `financeCsv.js`:

- `financePdfFilename(area, tenantId, date)` → reuse the `financeExportFilename` shape but `.pdf`
  (extract the shared base into `financeCsv.js` or duplicate the tiny formatter — prefer reusing
  `financeExportFilename` and swapping the extension at the call site).
- `downloadPdf(records, filename, { title })`:
  - records are the same `columnsToRecords` output (label→displayed-cell map, `'—'` for empty).
  - header row = the record keys (column labels); body = the record values.
  - `jspdf-autotable` renders the table; a small title line (`title`) + generated-on date footer.
  - triggers a browser download of `<filename>.pdf` (DOM side-effect, like `downloadCsv`).
- Empty input → no-op (button is disabled upstream anyway).

### New component — `src/components/finance/FinancePdfExportButton.jsx`

Sibling to `FinanceCsvExportButton`:

- props `{ records, area, tenantId, title, className }`.
- disabled with the same operator tooltip when `records` is empty.
- `data-testid="finance-pdf-<area>"`, `aria-label="Export <area> as PDF"`.
- onClick → `downloadPdf(records, financeExportFilename(area, tenantId) /* .pdf */, { title })`.

### Wiring

Render `FinancePdfExportButton` next to `FinanceCsvExportButton` everywhere the CSV button appears
today:

- `ChartOfAccountsPanel` (passes `EXPORT_COLUMNS` + `visible`, `title="Chart of accounts"`).
- `FinanceTablePanel` (the shared panel — adds the PDF button under the same `exportArea` gate, so all
  table panels: Draft invoices, Journal drafts, Approvals, Adapter queue, Journal entries get it).
- `LedgerSummary` and the Evidence pack export, matching their existing CSV export call sites.

(Consider a tiny shared `FinanceExportButtons` wrapper to avoid repeating the CSV+PDF pair at each call
site — optional; the plan will decide based on how many call sites there are.)

### Tests

- `src/components/finance/__tests__/financePdf.test.js`: `financePdfFilename` shape; `downloadPdf`
  invoked with the right records/columns (spy `jspdf`/autotable or the download trigger); empty → no-op.
- `src/components/finance/__tests__/FinancePdfExportButton.test.jsx`: enabled with records → click
  triggers download with the area+tenant `.pdf` filename; disabled + tooltip when empty.
- Update any panel export test that asserts the export control set (now CSV **and** PDF buttons present).

---

## Documentation updates (same PR)

- `docs/architecture/finance/finance-ops-IMPLEMENTATION-STATUS.md`:
  - §6 / §9: system-account rename residual retired; PDF export added to the console export set.
  - §9 deferred list: drop "PDF export"; note "system/seeded-account rename" done.
- `docs/architecture/finance/finance-ops-beta-limitations.md`: mark **#7b (PDF export)** implemented;
  amend the #10 residual (a) (system-account rename) as retired.
- `CHANGELOG.md`: `### Added` (PDF export) + `### Changed` (system-account rename now allowed under the
  generalized field-lock rule).

## Out of scope (explicitly)

- External accounting integration (provider live writes, QuickBooks/Xero/NetSuite, provider COA mapping).
- Granular `finance.accounts.manage` RBAC capability (kept admin/superadmin gate).
- CSV full-history / fetch-all (displayed-page only retained).
- Persistence activation, provider writes, period-close, projection cursors, authoritative runtime.mode,
  persistent evidence-pack registry — all remain deferred.
- Any env-var / migration / activation change.

## Risks / notes

- **Altitude:** Feature A generalizes the existing posted-history lock rather than adding a parallel
  system-account branch — one predicate (`codeClassLocked` / `reasonRequired`) covers both. This keeps
  the lock logic single-sourced.
- **Statement safety:** classification + `account_code` stay locked for system accounts, so the
  ledger/P&L/balance-sheet derivation (classification-based) and the deterministic baseline seed
  (code/id-based) are unaffected by a rename.
- **Bundle:** `jspdf` + `jspdf-autotable` add client weight; acceptable per the brainstorm decision
  (client-side chosen over a server endpoint to preserve the read-only/no-endpoint export posture).
- **Event-sourcing:** a system-account rename emits the same `finance.account.updated` event the
  manual-account edit already emits — replay fold + persistent rehydration already handle it (no fold
  change needed).
