# Finance COA Slice 1 — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: use `superpowers:executing-plans` (or subagent-driven-development) to implement this task-by-task.

**Goal:** Wire the chart of accounts into the journal write path and make it visible read-only, so account codes stop rendering "—" and accounts stop fragmenting by free-text name.

**Architecture:** A new `chartOfAccounts` module owns a per-tenant chart (lazy idempotent baseline seed). The single write choke point `financeDomainService.createJournalDraft` resolves each journal line to a real account (`account_id` + denormalized `account_code`), auto-creating a non-system account on a miss. A read endpoint + read-only console tab expose the chart. Works in **both** runtime modes: in-memory (static ephemeral baseline + per-process auto-creates) and persistent (`finance.accounts` table).

**Tech stack:** Node 22 + Express, event-sourced finance domain (`backend/lib/finance/`), React console (`src/components/finance/`), Node native test runner (backend) + Vitest (frontend).

**Design source (locked):** `docs/architecture/finance/finance-coa-wiring-and-cashflow-bridge-design.md` (§4 wiring, §5 read tab, §9 RESOLVED decisions). Review approval: PR #643 `#issuecomment-4633419140`.

**Scope (Slice 1 only):** COA seed + write-time resolution + read endpoint + read-only tab. **Out:** Bridge B (Slice 2), editable COA manager, historical backfill, provider COA mapping.

**Guardrails (must hold):** no provider writes, no production/staging action, no new mutation UI beyond existing test-mode helpers, no `ENABLE_FINANCE_PERSISTENT_EVENTS` / `FINANCE_PROVIDER_WRITES_ENABLED` flips, no migration applied by this work (172 already defines `finance.accounts`).

---

## Decisions locked (from design §9, do not re-litigate)

- **Resolution-on-miss → auto-create** a tenant-scoped **non-system** account (`is_system=false`) from deterministically-normalized `account_name` + `classification`, with a generated **reserved-range** code and audit metadata. Not reject; not silent-Uncategorized.
- **Seed → lazy + idempotent per tenant.** Persistent → `finance.accounts`; in-memory → static ephemeral baseline (must not pretend persistence).
- **UI → read-only first.** `GET /accounts` + read-only tab; no editable manager.
- **Backfill → none.** Existing emergent lines keep fallback display.

## Baseline chart (system accounts, `is_system=true`)

| code | name | classification | account_type |
|------|------|----------------|--------------|
| 1000 | Cash | Asset | Cash |
| 1100 | Accounts Receivable | Asset | Receivable |
| 2000 | Accounts Payable | Liability | Payable |
| 3000 | Retained Earnings | Equity | Equity |
| 4000 | Revenue | Revenue | Revenue |
| 5000 | Expenses | Expense | Expense |
| 9000 | Uncategorized | Asset | Suspense |

**Code generation (auto-create):** reserved range per classification to avoid colliding with system codes — Asset `15xx`, Liability `25xx`, Equity `35xx`, Revenue `45xx`, Expense `55xx`. Allocate the next free code in the range (deterministic: lowest unused). **Normalization for matching:** trim + collapse internal whitespace + case-fold; **display name preserves** the first-seen original casing.

---

## Task 1 — `chartOfAccounts` module (pure logic, mode-agnostic)

**Files:**
- Create: `backend/lib/finance/chartOfAccounts.js`
- Test: `backend/__tests__/lib/finance/chartOfAccounts.test.js`

**Behavior:**
- `DEFAULT_COA` — the baseline table above (frozen array).
- `normalizeAccountKey(classification, name)` → `\`${classification}:${casefold(trim(collapse(name)))}\`` (the match key).
- `nextCodeForClassification(classification, existingCodes)` → lowest free code in the reserved range; throws if range exhausted.
- `resolveAccount({ accounts, classification, account_name, account_code, account_id })` → pure resolver over an in-memory account list: returns `{ account, created }` where `account` has `{ id, account_code, name, classification, account_type, is_system }`. Priority: explicit `account_id` → explicit `account_code` → normalized name+classification → **auto-create** (`created:true`, `is_system:false`, generated code, `account_type` defaulted per classification).

**Steps (TDD):** write failing tests for each (normalization collisions "Cash"/"cash"/" Cash "; explicit-id wins; explicit-code wins; name match; miss→auto-create with reserved code; range-exhaustion throws), then implement, then green, then commit.

## Task 2 — In-memory COA store (per-tenant bucket)

**Files:**
- Modify: `backend/lib/finance/financeDomainService.js` (the in-memory `getTenantBucket` shape)
- Test: `backend/__tests__/lib/finance/financeDomainService.coa.test.js` (new)

**Behavior:** each tenant bucket gains `accounts` (array), **lazily seeded** with `DEFAULT_COA` (deep clone, stable synthetic ids) on first access. A helper `getTenantCoa(bucket)` ensures the seed. Auto-creates from Task 4 append to this array (ephemeral, per-process). No DB.

## Task 3 — Persistent COA store (`finance.accounts`)

**Files:**
- Create: `backend/lib/finance/coaStore.pg.js`
- Test: `backend/__tests__/lib/finance/coaStore.pg.test.js` (pg mocked, no real DB)

**Behavior:** `createFinancePgCoaStore({ pool })` exposes `ensureSeed(tenantId)` (idempotent upsert of `DEFAULT_COA` keyed on `unique(tenant_id, account_code)`), `list(tenantId)`, and `upsertAutoCreated(tenantId, account)` (insert non-system account; `ON CONFLICT (tenant_id, account_code)` no-op). Tenant-scoped; mirrors the event-store DI pattern (injected pool, no silent fallback). **Not wired** to a live DB by this slice — used only when persistent mode is active.

## Task 4 — Resolve lines in the write choke point

**Files:**
- Modify: `backend/lib/finance/financeDomainService.js:createJournalDraft` (the single choke point — `simulateDealWon` flows through it at `:447`)
- Test: extend `financeDomainService.coa.test.js`

**Behavior:** after `assertBalancedJournal(payload.lines)` and before building `journalEntry`, resolve each validated line through `resolveAccount` against the tenant COA (in-memory bucket array, or — when a persistent COA store is injected — its `list`+`upsertAutoCreated`). Attach `account_id` and denormalized `account_code` to each line; keep `account_name`/`classification` as-is. Emit a `finance.account.created` event (via the existing event path) for each auto-created account, with actor + trace metadata. **Read-your-write:** the projections already key on `account_id` when present (`ledgerProjection.accountKey`), so no projection change needed — codes now flow through.

**Steps (TDD):** failing test "a deal-won draft resolves both lines to seeded accounts (codes 1100 + 4000), account_id populated"; "an unseeded line name auto-creates a non-system account in the reserved range and emits finance.account.created"; "re-running with the same name reuses the account (no duplicate, no second created event)". Implement, green, commit.

## Task 5 — Read endpoint `GET /api/v2/finance/accounts`

**Files:**
- Modify: `backend/routes/finance.v2.js` (add the GET; module-gate + data-mode posture identical to peers)
- Modify: read adapters — `inMemoryFinanceReadAdapter.js` (return seeded+created bucket accounts) and `projectionBackedFinanceReadAdapter.js` (return `coaStore.list`)
- Test: extend `backend/__tests__/routes/finance.v2.read-routes.test.js`

**Behavior:** returns `{ accounts: [{ id, account_code, name, classification, account_type, parent_account_id, is_system, is_active }] }`, tenant-scoped, read-only. In-memory mode returns the static baseline (+ any auto-creates this process). Persistent failure → 503 (no silent in-memory fallback, per §6 posture).

## Task 6 — Frontend read client + read-only tab

**Files:**
- Modify: `src/api/finance.js` (add `getAccounts(tenantId, { signal })` — GET-only, no mutation helper)
- Create: `src/components/finance/ChartOfAccountsPanel.jsx` (uses `FinanceTablePanel`; columns: Code, Name, Classification, Type, Parent, System, Active)
- Modify: `src/pages/FinanceOps.jsx` (`FINANCE_OPS_TABS` — add `{ id: 'accounts', label: 'Chart of accounts' }` immediately after `ledger`; this is the §6.2 freeze extension recorded in the design)
- Tests: `src/components/finance/__tests__/ChartOfAccountsPanel.test.jsx` (new) + update `FinanceOps.smoke.test.jsx` (tab count/labels)

**Behavior:** read-only table, Refresh + CSV export (reuse `FinanceTablePanel` chrome). No create/edit/deactivate affordance.

## Task 7 — Account codes light up in existing panels (verification, not new code)

**Files:**
- Verify/adjust: `JournalDraftsPanel.jsx` / `JournalEntriesList.jsx` already render `account_code`; confirm a resolved draft now shows the real code (not "—"). Keep the honest fallback ("—") for any legacy free-text line with no `account_id`.
- Test: extend the relevant panel test with a row that has `account_code`.

## Final review

- Run full finance backend suite + finance frontend suite; lint clean.
- Confirm guardrails intact (no mutation UI, no provider/persistent flips, no migration applied).
- Update `CHANGELOG.md` and `finance-ops-IMPLEMENTATION-STATUS.md` (move COA from "design-only §7" to "implemented", note Slice 2 / Bridge B still pending).
- Then `superpowers:finishing-a-development-branch`.

## Notes on sequencing & risk

- Tasks 1→2→4 are the spine (logic → in-memory store → wiring). Task 3 (persistent store) is independent and inert until persistent mode is active; can land in the same PR but is not on the in-memory critical path.
- The whole slice is **additive**: `account_id` was already a nullable column / optional key. Existing emergent behavior is the fallback, so nothing breaks for legacy lines.
- No migration is applied — `finance.accounts` (172) already exists; the persistent store just uses it when the operator enables persistent mode + applies migrations.
