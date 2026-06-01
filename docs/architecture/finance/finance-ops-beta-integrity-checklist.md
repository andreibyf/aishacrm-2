# Finance Ops — Beta Integrity Checklist

**Date:** 2026-05-31
**Branch:** `feat/finance-ops-beta-implementation`
**Packet:** Finance Ops beta-readiness pivot — "Beta Integrity & Export Readiness".
**Posture:** read-only console on the in-memory domain service; no provider writes, no persistent-events
route lift, no production action.

This checklist maps each beta integrity principle to where it is enforced and the evidence that proves it,
with an honest **Implemented / Partial / Deferred** status. "Evidence" cites the tests added in this slice
and the source of truth they lock.

Legend: ✅ Implemented · 🟡 Partial (works for the read-only beta scope; named gap deferred) · ⛔ Deferred.

---

## 1. Financial accuracy ✅

| Claim                                                                   | Enforcement                                                                                                                                                                                                                                        | Evidence                                                                                                                                                                                                          |
| ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ledger / journal / invoice / P&L / balance-sheet agree with source data | All statements derive from one engine over the journal entries — `backend/lib/finance/accountingEngine.js` `buildLedger` / `buildProfitAndLoss` / `buildBalanceSheet`; routes pass them through unchanged (`backend/routes/finance.v2.js:200-228`) | `backend/__tests__/lib/finance/accountingEngine.integrity.test.js` (hand-computed totals); `backend/__tests__/routes/finance.v2.read-routes.test.js` › "engine parity" (route body == engine output, bit-for-bit) |
| Totals consistently calculated & formatted                              | Integer cents end-to-end; UI formats once via `formatCents` (`src/components/finance/LedgerSummary.jsx:28-31`)                                                                                                                                     | `src/components/finance/__tests__/LedgerSummary.integrity.test.jsx` (rendered `$1,200.00` net income, `$6,200.00` assets == source)                                                                               |
| Debits/credits & balance-sheet values displayed clearly                 | `LedgerSummary` renders per-account balances, debit/credit totals, revenue/expense/net income, assets/liabilities/equity                                                                                                                           | `LedgerSummary.test.jsx` "formats cents data as currency … not raw API field names"                                                                                                                               |
| Empty states must not hide calculation errors                           | Balance state is three-valued; an absent/failed/unbalanced sheet is never shown as "Balanced: Yes"                                                                                                                                                 | `LedgerSummary.integrity.test.jsx` (unbalanced→warning; absent→Unknown; failed→error, no balance row)                                                                                                             |

## 2. Consistency ✅

| Claim                                                                               | Enforcement                                                                                                                                           | Evidence                                                                                                                        |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| UI, API, and tests use the same finance semantics                                   | Single engine + GET pass-through; the frontend client unwraps `{status,data}` without reshaping (`src/api/finance.js`)                                | route-parity + UI-integrity tests above assert the same numbers at all three layers                                             |
| Journal status semantics stable (`draft`, `pending_approval`, `posted`, `reversed`) | Ledger counts only `posted`/`reversed` (`accountingEngine.js:76-80`); `/journal-drafts` = `draft`+`pending_approval` subset (`finance.v2.js:269-296`) | integrity test asserts draft/pending excluded from the ledger (no `999999`/`777777` leakage)                                    |
| Repeated reads produce consistent results                                           | Reads are pure over in-memory state; "no mutation" route test confirms GETs don't change state                                                        | `finance.v2.read-routes.test.js` › "no mutation"                                                                                |
| Tenant filtering + module gating consistent across routes                           | Shared 3-gate stack (`ENABLE_FINANCE_OPS` mount → `validateTenantAccess` → per-tenant `financeOps` gate)                                              | `finance.v2.read-routes.test.js` › "authorization matrix" (403 disabled / 403 tenant-mismatch / 200 enabled for every endpoint) |

## 3. Immutability 🟡

| Claim                                                                | Status      | Detail                                                                                                                                                       |
| -------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Posted/finalized records not silently mutable from this surface      | ✅          | `src/api/finance.js` is GET-only; the 6 mutating Finance v2 endpoints are not referenced by the UI client                                                    |
| Corrections are reversal/adjustment-style, not destructive overwrite | ✅          | `createReversalDraft` (`accountingEngine.js:196-228`) emits a new reversing entry; originals are retained                                                    |
| Durable immutability storage (append-only persistence)               | ⛔ Deferred | Runtime is in-memory for beta (`buildSource mode:'in_memory'`); persistent append-only store + persistent-events route lift are Phase 4-1, out of this slice |

## 4. Accountability ✅ / 🟡

| Claim                                                                          | Status      | Detail / Evidence                                                                                                                                |
| ------------------------------------------------------------------------------ | ----------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Records expose tenant, actor, timestamp, event/source, status, correlation IDs | ✅          | `/audit-events` maps `occurred_at<-created_at`, `actor<-actor_id`, `aggregate_*`, `event_type`, `payload` (`finance.v2.js:362-416`)              |
| Audit Timeline + Evidence/Audit Packs support recordkeeping review             | ✅          | `/audit-events` (cursor-paginated) + on-demand tamper-evident `/evidence-packs` with integrity hashes (`auditEvidenceBuilder.buildEvidencePack`) |
| Access/module denial is auditable/testable                                     | ✅          | authorization-matrix tests assert 403 paths deterministically                                                                                    |
| Persistent evidence-pack registry / file download                              | ⛔ Deferred | Evidence packs are built on demand; a persistent pack registry + file export is a follow-up                                                      |

## 5. Export-based recordkeeping ✅ CSV implemented / 🟡 PDF deferred

Implemented in the Beta Exports slice (`feat/finance-ops-beta-exports`). CSV export is wired into the
read-only panels and serialized from each panel's **displayed column model** (`columnsToRecords` →
header = column label, cell = `render(row) ?? row[key]`), so the export provably matches on-screen/API data.

| Claim                               | Enforcement                                                                                                                                         | Evidence                                                                                                                                  |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Exports match on-screen/API data    | `src/components/finance/financeCsv.js` `columnsToRecords` over each panel's displayed `columns`+`rows`; Ledger uses operator labels + `formatCents` | `financeCsv.test.js`; `*.export.test.jsx` per panel; `LedgerSummary.export.test.jsx` asserts `$` amounts + labels, not raw `*_cents`/JSON |
| Tenant-scoped + read-only           | Export serializes only already-fetched, gated, displayed data; no new endpoint, no POST/mutation                                                    | per-panel read-only assertions (`LiveDataPanels.test.jsx`, `LedgerSummary.test.jsx`)                                                      |
| No secrets/credentials/tokens       | Built from displayed columns (no credential fields); `/adapters` registry is **not** exported                                                       | `EvidencePlaceholder.export.test.jsx` asserts no `secret/credential/token/api_key/password`                                               |
| Deterministic empty state           | Export button **disabled with an operator-facing tooltip** when a panel has no rows                                                                 | `FinanceCsvExportButton.test.jsx`; per-panel disabled-when-empty tests                                                                    |
| Filenames carry context, no secrets | `financeExportFilename` → `finance-<area>_<tenantShort>_<YYYY-MM-DD>`                                                                               | `financeCsv.test.js`                                                                                                                      |

Covered panels: Draft Invoices, Journal Drafts, Approvals, Adapter Queue, Journal Entries, Audit Timeline,
Ledger Summary, Evidence pack. **PDF export remains deferred** (CSV is the beta recordkeeping export; PDF is
a follow-up enhancement). See [finance-ops-beta-limitations.md](./finance-ops-beta-limitations.md).

---

## Beta blocker review (packet §"Beta blockers")

| Blocker                                          | Status in this slice                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| UI totals ≠ API/source                           | Closed — locked by route-parity + UI-integrity tests                                             |
| Raw backend field-shape as primary UI            | Not present — `LedgerSummary` formats; verified by existing test                                 |
| Ambiguous draft vs posted vs reversed            | Closed — status semantics asserted; drafts/pending excluded from ledger                          |
| Mutation path for posted/final records           | Not present — GET-only client; verified by "no mutation" test                                    |
| Missing tenant isolation on reads                | Closed — authorization-matrix tests                                                              |
| Exports differ from on-screen data               | N/A this slice (export deferred); constraint recorded for the export slice                       |
| `/adapters` exposing credentials / write surface | Not present — declarative metadata only (`financeAdapterRegistry.js`); no-credential test exists |
| Provider-write / production-activation path      | Not present — `FINANCE_PROVIDER_WRITES_ENABLED` default-closed; no flip                          |
| Tests failing / undocumented limitations         | Closed — suites green; limitations documented in `finance-ops-beta-limitations.md`               |
