# Finance Ops — Beta Exports Slice (CSV) — Design

**Date:** 2026-05-31
**Branch:** `feat/finance-ops-beta-exports`
**Packet:** Finance Ops Beta Exports (Slack `#development` ts `1780283428.052699`)
**Status:** Design — holding for Codex review + Andrei authorization.

---

## 1. Goal & principle

Beta-grade **CSV export** for recordkeeping handoff. CSV is the must-have; **PDF is deferred** (follow-up).
Exports must reflect the **same tenant-scoped, read-only data shown in the Finance Ops UI/API**, serialized
from the same displayed column model so the export matches what beta users see. Not provider sync, not
accounting-system integration.

**Scope decision (Andrei):** export **what's displayed** — the rows currently loaded in the panel (a 50-row
page for table panels; accumulated rows for the audit timeline). If a panel has >50 rows, only the loaded
page exports; this is a documented beta limitation. Acceptable while beta data is small/in-memory.

## 2. Architecture

Frontend-only. Each panel already fetches its data through the gated, tenant-scoped read API
(`src/api/finance.js`) and holds the displayed rows in component state. Export serializes **that** state —
so it is tenant-scoped and secret-safe **by construction** (it cannot export anything the read API didn't
already return and the UI didn't already show). No backend route, no new endpoint, no mutation.

```
panel state (already-fetched, displayed rows/columns)
   └─ columnsToRecords(columns, rows)  →  labeled records  (header = column label, cell = render(row) ?? row[key])
        └─ FinanceCsvExportButton  →  CsvExportButton (existing Blob download)  →  <area>_<tenant>_<date>.csv
```

## 3. Components

### 3.1 New util — `src/components/finance/financeCsv.js`

- `columnsToRecords(columns, rows)` → `Array<Record<label,string>>`. For each row, for each column:
  value = `column.render ? column.render(row) : row[column.key]`; empty (`null`/`undefined`/`''`) →
  `EMPTY_DISPLAY` (`'—'`) — the **same placeholder the read-only tables render** (`FinanceTablePanel`,
  `AuditTimelinePanel`, `EvidencePlaceholder`), so a CSV cell matches the displayed cell exactly; else
  `String(value)`. Header keys are the column **labels** (so the CSV header reads "Amount (cents)", matching
  the on-screen column). (This is a human-recordkeeping export — the em dash, not a blank, is intentional for
  display parity.)
- `financeExportFilename(area, tenantId, date)` → `finance-<area>_<tenantShort>_<YYYY-MM-DD>` (tenantShort =
  first 8 chars of the tenant UUID; no tokens/secrets in the name). `date` injected by the caller
  (`new Date()`), not hard-coded.

### 3.2 New wrapper — `FinanceCsvExportButton`

Thin wrapper over the existing `src/components/shared/CsvExportButton.jsx` (reused via its `renderTrigger`
prop so we control the label/tooltip/disabled state). Props: `records` (precomputed labeled records),
`area`, `tenantId`, `disabled`. Renders an "Export CSV" button; when there are no records it is **disabled
with an operator-facing `title`** ("Nothing to export — this panel has no rows for the current tenant").

### 3.3 Panel wiring

| Panel                                                                          | Source of displayed rows         | Export records                                                                                                                                                       |
| ------------------------------------------------------------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FinanceTablePanel` (Draft Invoices, Journal Drafts, Approvals, Adapter Queue) | `rows` + `columns`               | `columnsToRecords(columns, rows)`                                                                                                                                    |
| `JournalEntriesList`                                                           | `entries` + `COLUMN_DEFS`        | `columnsToRecords(COLUMN_DEFS, entries)`                                                                                                                             |
| `AuditTimelinePanel`                                                           | loaded `events` + `COLUMNS`      | `columnsToRecords(COLUMNS, events)`                                                                                                                                  |
| `LedgerSummary`                                                                | ledger/P&L/balance-sheet objects | statement records `{ Section, Line, Amount }` with operator labels + `formatCents` amounts (NOT raw `*_cents`)                                                       |
| `EvidencePlaceholder`                                                          | single `pack`                    | field records `{ Field, Value }` for the displayed pack fields (pack_id, generated_at, artifact_count, pack/events/approvals hashes — integrity hashes, not secrets) |

`FinanceTablePanel` gains an optional `exportArea` prop; when set it renders `FinanceCsvExportButton` in the
header next to Refresh. The four table panels pass their `exportArea`. The bespoke panels add the button to
their own headers.

Out of scope (no export button): `ProjectionStatusPanel` (deferred gap — no honest data), `RuntimeOverview`
(counts/status, not a record set), `SandboxAdapterPanel`/`/adapters` (status metadata; skipped to avoid any
adapter-config surface — documented).

## 4. Empty-state behavior

Deterministic: when a panel has zero displayed rows, the export button is **disabled with an explanation**
(packet-allowed option). No empty-file-with-headers path needed; the disabled state is clearer for an
operator. Tested.

## 5. Secret safety

Exports are built from the same displayed columns, which already exclude secrets (the read API surfaces no
credentials; `/adapters` is declarative and is **not** exported). Evidence export includes only pack
metadata + integrity **hashes** (not secrets). A test asserts no credential-like fields appear in the
adapter-jobs and evidence exports.

## 6. Testing

- **Util:** `columnsToRecords` uses `render` and labels; null/empty → `''`; `financeExportFilename` shape +
  no secret leakage.
- **Per-panel:** export button present and enabled when rows exist; the records it would export equal the
  displayed values; disabled (with title) when empty.
- **LedgerSummary regression (packet):** export contains operator labels + `$` amounts (e.g. "Net income",
  "$1,200.00"), and does NOT contain raw `*_cents` keys or raw JSON.
- **Secret safety:** adapter-jobs + evidence export records contain no credential/token fields.
- **Read-only:** export adds no POST/PATCH/DELETE; no mutation affordance; `src/api/finance.js` stays GET-only.

## 7. Docs

- `finance-ops-beta-integrity-checklist.md` §5 Export: Deferred → **Implemented (CSV)** with evidence; note
  the >50-row page cap and PDF deferral.
- `finance-ops-beta-limitations.md`: CSV export implemented for the listed panels; **PDF deferred** (CSV is
  the beta recordkeeping export); `/adapters` + projection panels have no export and why; >50-row page cap.
- `CHANGELOG.md`.

## 8. Hard constraints honored

No provider writes/sync; no approve/reject/reverse/replay/retry/cancel/mutation controls; no POST/PATCH/DELETE
finance helpers; no `ENABLE_FINANCE_PERSISTENT_EVENTS` / `FINANCE_PROVIDER_WRITES_ENABLED` flip; no
persistent-events route lift; no migration; no staging/Coolify/Doppler/provider/production action. Commits
held for Codex review.

## 9. Acceptance

CSV export on Draft Invoices, Journal Drafts, Approvals, Adapter Queue, Journal Entries, Audit Timeline,
Ledger Summary, Evidence; each export matches displayed values; Ledger export shows operator labels/amounts
not raw field shapes; empty panels show a disabled+explained export; no secrets in any export; PDF documented
as deferred; finance suites green; lint/format clean.
