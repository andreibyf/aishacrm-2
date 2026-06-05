# Finance Cash Flow Bridge B — Slice 2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` to implement task-by-task.

**Goal:** A read-only Cash Flow **statement** derived from posted finance journal lines on cash/bank accounts — the 4th core financial statement alongside the ledger / P&L / balance sheet. Finance is the source of truth; **nothing** is written into the `cash_flow` module table and **nothing new** into the ledger.

**Architecture:** A pure derivation (`cashFlowStatement`) identifies cash/bank accounts via the COA `account_type` (Slice 1) and folds **posted/reversed** journal lines on those accounts into period buckets (inflow = debits to cash, outflow = credits). Exposed read-only via `GET /api/v2/finance/cash-flow` + a "Cash flow" Finance Ops console tab, in both runtime modes (partition-aware, fail-closed) — same pattern as Slice 1.

**Design source:** `finance-coa-wiring-and-cashflow-bridge-design.md` §6 ("Bridge B"), approved on PR #643. This plan refines the §6.4 surface decision (see Task 4).

---

## ⚠️ Critical reality — the statement is honestly EMPTY until journals post

`accountingEngine.buildLedger` counts only `['posted', 'reversed']` entries (`accountingEngine.js:78`), and **there is no journal-posting emit-site today** — journals reach `pending_approval`/`approved` but never `posted`. That is exactly why the **Ledger / P&L / Balance-sheet tabs are empty right now.** Bridge B must reconcile to the balance sheet's Cash line, so it derives from the **same posted/reversed lines** — meaning the Cash Flow statement is **honestly empty until a journal-posting slice lands**, just like the other three statements.

**This is intentional and consistent**, not a bug: Slice 2 ships the derivation + surface with an honest empty state (no fake data), ready to light up the moment posting exists. **Do NOT** broaden the status filter to `approved`/`pending_approval` to "make it show data" — that would desync the cash-flow statement from the balance sheet (the cardinal sin of a cash-flow statement). The derivation is fully testable now by seeding `posted` entries in tests.

> **Sequencing note for the reviewer:** a **journal-posting slice** (approved → `posted`, emitting `finance.journal.posted`) is the single change that lights up *all four* statements (ledger, P&L, balance sheet, **and** this one). If the goal is a non-empty console sooner, posting is higher-leverage than Bridge B and could be sequenced first or bundled. Flagged for your call; this plan assumes Bridge B as requested.

## Scope / non-goals

**In:** cash-flow derivation, read endpoint, read-only console tab. **Out (per design):** writing into `cash_flow`; any new ledger write; `cash_flow → ledger` posting (Direction A); bidirectional sync; reconciliation/dedup between the manual `cash_flow` tracker and the derived statement; editable controls.

**Guardrails:** no provider writes, no production/staging action, no env flips, no migration, no mutation UI.

---

## Cash-account identification

Cash/bank accounts = COA accounts with `account_type ∈ { 'Cash', 'Bank' }` (the Slice-1 discriminator; the seeded `Cash` (1000) is the default). **Not** name-matching. A tenant with no cash-typed account ⇒ empty statement (honest).

## Derivation

For each **posted/reversed** journal entry, for each line whose `account_id` is a cash/bank account:
- **inflow_cents += debit_cents** (cash increases on a debit), **outflow_cents += credit_cents** (cash decreases on a credit).
- Bucket by **period** = `YYYY-MM` of the entry's `posted_at ?? created_at`.
- `net_cents = inflow_cents − outflow_cents` per period; plus an all-time total.
- (Optional, Task 1b) categorize each movement by the *contra* line's `classification` (cash from Revenue vs cash to Expense) — include only if cheap; otherwise defer.

Output shape: `{ cash_account_codes: [...], periods: [{ period, inflow_cents, outflow_cents, net_cents }], totals: { inflow_cents, outflow_cents, net_cents } }`. Amounts in integer cents (UI formats via `formatCentsAmount`).

---

## Task 1 — `cashFlowStatement` derivation (pure)

**Files:**
- Create: `backend/lib/finance/cashFlowStatement.js`
- Test: `backend/__tests__/lib/finance/cashFlowStatement.test.js`

**Behavior:** `buildCashFlowStatement(journalEntries, accounts)` — pure. Resolve cash/bank `account_id`s from `accounts`; fold posted/reversed lines into periods (above). Empty/honest when no cash accounts or no posted lines.

**Steps (TDD):** failing tests — (a) empty when nothing posted; (b) a posted entry Debit Cash 250000 / Credit Revenue 250000 → period inflow 250000, outflow 0, net 250000; (c) a posted Debit Expense / Credit Cash → outflow; (d) only `posted`/`reversed` count (draft/pending_approval/approved excluded — reconciles to the ledger); (e) lines on non-cash accounts ignored; (f) multi-period bucketing. Implement; green; commit.

## Task 2 — domain service + read adapters

**Files:**
- Modify: `backend/lib/finance/financeDomainService.js` — `getCashFlow(tenantId)` = `buildCashFlowStatement(listJournalEntries(tenantId), getTenantCoa(...))`.
- Modify: `inMemoryFinanceReadAdapter.js` (`getCashFlow` → service), `projectionBackedFinanceReadAdapter.js` (`getCashFlow(tenantId,{isTestData})` — derive from the `journal_entries` projection + event-sourced COA; **fail-closed** → 503).
- Test: extend the adapter tests + a `financeDomainService.cashflow.test.js`.

## Task 3 — read endpoint `GET /api/v2/finance/cash-flow`

**Files:**
- Modify: `backend/routes/finance.v2.js` — module-gated; resolve the Test/Live partition via `resolveReadIsTestData(req)` and pass to `readAdapter.getCashFlow` (persistent only; in-memory ignores). Returns `{ status:'success', data: { cash_flow: <statement>, source } }`.
- Test: extend `finance.v2.read-routes.test.js` (200 + shape; empty-state; partition threaded).

## Task 4 — frontend read client + read-only tab

**Surface decision (refines design §6.4):** put it in the **Finance Ops console as a "Cash flow" tab**, alongside Ledger summary / (implicitly P&L + balance sheet) — because a cash-flow *statement* is the 4th financial statement and belongs with the others, shares the console's gating/empty-state patterns, and avoids coupling into / polluting the lightweight manual `cash_flow` tracker page. (The design's original "Cash Flow page section" remains a possible later add for manual-tracker users.) **Confirm this with the reviewer before building.**

**Files:**
- Modify: `src/api/finance.js` — `getCashFlow(tenantId,{signal})` (GET-only).
- Create: `src/components/finance/CashFlowStatementPanel.jsx` — read-only; periods table (Period, Inflow, Outflow, Net) with `formatCentsAmount`; honest empty state ("No posted cash movements yet"); CSV export via the shared chrome. No mutation controls.
- Modify: `src/pages/FinanceOps.jsx` — add `{ id: 'cash-flow', label: 'Cash flow' }` after `ledger`/`accounts`; amend the §6.2 tab-inventory doc (`finance-ui-slice-1-read-only-console-design.md`).
- Tests: `CashFlowStatementPanel.test.jsx` (data/empty/error/read-only) + update `FinanceOps.smoke.test.jsx` (tab count 12→13 + panel mapping) + `finance.test.js` export allow-list (+`getCashFlow`).

## Task 5 — honest empty state + docs

- Ensure the tab + endpoint render an explicit, honest empty state (consistent with the existing gap/empty cards) noting cash movement appears once journals are posted — never fake data.
- Update `CHANGELOG.md` and `finance-ops-IMPLEMENTATION-STATUS.md` (move Bridge B from "design-only" to implemented; record the honest-empty-until-posting caveat; note the journal-posting slice as the unlock).

## Final review

- Full finance backend + frontend suites green; lint clean.
- Guardrails intact (no writes into `cash_flow`, no ledger writes, no provider/production/env/migration).
- Then `superpowers:finishing-a-development-branch`.

## Decisions locked (2026-06-05)

- **Direction = Bridge B only (A).** Auto-derived cash-flow *statement* from Finance's own posted journals. **No "sync" button** (nothing external to sync — it's a derivation of the tenant's own ledger, always available as a read once Finance is active, with a normal Refresh). **No import from the manual Cash Flow module** (Direction A stays out — un-audited single-sided entries must never be synthesized into the audited double-entry ledger).
- **Surface = Finance Ops "Cash flow" tab** (auto-on when `financeOps` is active), alongside the other statements. The manual Cash Flow Management module remains independent and is untouched.

## Open questions for the reviewer

1. **Sequencing** — ship Bridge B now (correct but empty until journals post) as planned, or do a **journal-posting slice first** so all four statements show data? *(Recommended: posting first or bundled — otherwise Bridge B is a permanently-empty statement until then.)*
2. **Contra categorization** (Task 1b) — include the cash-from-Revenue / cash-to-Expense breakdown in Slice 2, or defer?
