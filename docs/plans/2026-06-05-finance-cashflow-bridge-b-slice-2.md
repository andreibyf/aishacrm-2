# Finance Slice 2 — Journal Posting + Cash Flow Bridge B (bundled) — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement task-by-task.

**Goal:** Make the finance statements show real data and add the 4th one. Two bundled parts (reviewer chose "bundle both"):
- **Part 1 — Journal posting.** Wire the missing `finance.journal.posted` emit-site (approved → `posted`) so the **Ledger / P&L / Balance-sheet** stop being empty, plus a **test-mode** path to produce posted sandbox journals (the read-only console has no approve/post controls).
- **Part 2 — Cash Flow Bridge B (with contra categorization).** A read-only cash-flow **statement** derived from posted cash/bank journal lines, **categorized by contra classification** (cash from Revenue, cash to Expense, …), as a Finance Ops "Cash flow" tab.

**Design source:** `finance-coa-wiring-and-cashflow-bridge-design.md` §6 (Bridge B), approved #643.

## Decisions locked (2026-06-05)

- **Bridge B only (A)** — auto-derived statement from Finance's own posted journals. **No "sync" button, no import from the manual Cash Flow module** (Direction A stays out — un-audited single-sided entries never enter the audited ledger).
- **Surface** = Finance Ops "Cash flow" tab, auto-on when `financeOps` is active. Manual Cash Flow Management module untouched.
- **Sequencing** = bundle posting + Bridge B so cash flow ships showing data.
- **Categorization** = include contra-classification breakdown in this slice.

**Guardrails (must hold):** no provider writes, no production/staging action, no env flips, no migration. **Posting is human-gated** — it only fires from `approveFinanceAction`, which is already AI-blocked (`finance.ai.no_money_movement`), so AI still cannot move money. No approve/post controls are added to the **live** console; posted *test* data is a sandbox affordance only.

---

## What already exists (verified)

- `accountingEngine.buildLedger` counts `['posted','reversed']` (`accountingEngine.js:78`) — so posting is the single unlock for ledger/P&L/balance-sheet.
- `journalEntriesProjection` **already consumes `finance.journal.posted`** and `rebuildBucketFromEvents` has the case stubbed — both anticipate posting; only the emit-site is missing.
- `approveFinanceAction` is human-only and currently emits `finance.approval.approved`, leaving the journal at `pending_approval`.
- Test-mode sandbox creation already exists (`FinanceCreatePanel` → `simulateDealWon`, gated to test mode, `is_test_data`).

---

## PART 1 — Journal posting

### Task 1 — emit `finance.journal.posted` on approval
**Files:** `backend/lib/finance/financeDomainService.js` (`approveFinanceAction`); test `financeDomainService.posting.test.js` (new).
**Behavior:** when the approved approval's target is a `journal_entry`, transition that entry `pending_approval → posted`, stamp `posted_at`/`posted_by`, and append `finance.journal.posted` with the full entry under `payload.journal_entry` (the shape the projection + replay already expect). Non-journal approvals (e.g. adapter jobs) are unaffected. Human-gated (AI cannot reach `approveFinanceAction`).
**TDD:** approve a pending journal approval → entry status `posted`, one `finance.journal.posted` event, and `getLedger` now reflects the entry; approving a non-journal approval does not emit it.

### Task 2 — wire the bucket + replay
**Files:** `financeDomainService.js` (in-memory bucket: set the entry `posted` on approve), `financeDomainReplay.js` (un-stub the `finance.journal.posted` case → upsert `payload.journal_entry`). Tests extend the replay + projection suites.
**Acceptance:** an approved (posted) journal appears in `/journal-entries` as `posted` and contributes to ledger/P&L/balance-sheet in both runtime modes (read-your-write + replay).

### Task 3 — test-mode posted sandbox data
**Files:** `backend/lib/finance/financeDomainService.js` (+ optional `simulatePostedDealWon` test helper / a flag on `simulateDealWon`), `src/components/finance/FinanceCreatePanel.jsx`, `src/api/financeWrites.js`.
**Behavior:** a **test-mode only** affordance that produces a fully **posted** sandbox journal (draft → posted, `is_test_data=true`), so the Ledger/P&L/Balance-sheet/Cash-flow tabs show sample data without exposing approve/post controls in the live console. Live mode: no such control — posting stays on the real human approval path. Tests: the action yields a posted test entry that lands in the ledger; absent/disabled in live mode.

> **Design check for the reviewer:** Task 3 is the only place posting becomes UI-reachable, and only for sandbox (`is_test_data`) data. Confirm this is the intended way to populate the console, vs. leaving posting backend-only.

---

## PART 2 — Cash Flow Bridge B (+ contra categorization)

Cash/bank accounts = COA `account_type ∈ {Cash, Bank}` (Slice 1). Fold **posted/reversed** lines on those accounts into periods (`YYYY-MM` of `posted_at ?? created_at`): inflow = debits to cash, outflow = credits, `net = inflow − outflow`. **Categorize** each movement by the *contra* line's classification.

### Task 4 — `cashFlowStatement` derivation (pure)
**Files:** `backend/lib/finance/cashFlowStatement.js` (new) + test.
**Behavior:** `buildCashFlowStatement(journalEntries, accounts)` → `{ cash_account_codes, periods:[{ period, inflow_cents, outflow_cents, net_cents, by_category:[{ classification, inflow_cents, outflow_cents }] }], totals }`. Pure; honest-empty when no cash accounts / no posted lines. **Reconciles to the ledger** (same posted/reversed filter — never broaden it).
**TDD:** posted Debit Cash/Credit Revenue → inflow under a `Revenue` category; posted Debit Expense/Credit Cash → outflow under `Expense`; draft/pending/approved excluded; non-cash lines ignored; multi-period; multi-contra categorization.

### Task 5 — domain service + read adapters
`financeDomainService.getCashFlow(tenantId)`; in-memory adapter → service; persistent adapter derives from the `journal_entries` projection + event-sourced COA, partition-aware (`isTestData`), **fail-closed → 503**. Tests extend adapter suites.

### Task 6 — `GET /api/v2/finance/cash-flow`
Module-gated; `resolveReadIsTestData(req)` → adapter; returns `{ data: { cash_flow, source } }`. Route test (shape, partition, empty/data).

### Task 7 — frontend read client + "Cash flow" tab
`src/api/finance.js` `getCashFlow`; `CashFlowStatementPanel.jsx` (periods + category breakdown, `formatCentsAmount`, honest empty state, CSV export, no mutation); `FinanceOps.jsx` add `{ id:'cash-flow', label:'Cash flow' }`; amend §6.2 tab-inventory doc; `CashFlowStatementPanel.test.jsx` + smoke (12→13 tabs) + `finance.test.js` allow-list (+`getCashFlow`).

---

## Final review
- Full finance backend + frontend suites green; lint clean.
- Guardrails intact (no writes into `cash_flow`, no provider/production/env/migration; AI still cannot post; live console adds no approve/post controls).
- Update `CHANGELOG.md` + `finance-ops-IMPLEMENTATION-STATUS.md` (posting wired → statements populate; Bridge B implemented; note posting is approval-driven/human-gated).
- `superpowers:finishing-a-development-branch`.

## Decisions — all resolved (2026-06-05)
- **Task 3 posting affordance — APPROVED.** The test-mode "posted sandbox journal" control IS the intended way to populate the console (sandbox / `is_test_data` only; the live console adds no approve/post controls). Plan fully approved; proceed to implementation.
