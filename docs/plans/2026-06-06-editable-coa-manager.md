# Editable Chart of Accounts Manager — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Let a tenant create / edit / deactivate / reactivate chart-of-accounts accounts and set a curated `account_type` (incl. `Bank`/`Cash`), retiring beta limitation #10 — pure event-sourced, in-memory-first, no migration/flag/provider writes.

**Architecture:** Approach A. New `finance.account.created`(manual)/`updated`/`deactivated` events are folded into the in-memory chart by `financeDomainReplay.js` + `getTenantCoa`. Four domain methods (`createAccount`/`updateAccount`/`deactivateAccount`/`reactivateAccount`) enforce all lock rules server-side and append events through the existing `runWrite` path. The read-only `ChartOfAccountsPanel` gains create/edit/deactivate affordances.

**Tech Stack:** Node 22 + native test runner (backend), Express V2 routes, React 18 + Vitest (frontend). Design: `docs/plans/2026-06-06-editable-coa-manager-design.md` — read it first; this plan implements it.

**Conventions:** TDD (failing test first). Commit after each green task with trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Backend tests: `cd backend && node --test "__tests__/lib/finance/**/*.test.js" "__tests__/routes/finance*.test.js"`. Lint: `npx eslint <files>`. Do NOT apply migrations, flip env flags, or touch staging/prod.

---

## Phase 1 — Pure COA logic (`chartOfAccounts.js`)

### Task 1: Curated `account_type` enum + per-classification validation

**Files:**
- Modify: `backend/lib/finance/chartOfAccounts.js`
- Test: `backend/__tests__/lib/finance/chartOfAccounts.test.js`

**Step 1 — failing tests.** Add to the test file:
```js
import { ACCOUNT_TYPES_BY_CLASSIFICATION, isValidAccountType } from '../../../lib/finance/chartOfAccounts.js';

test('curated account_type is validated per classification', () => {
  assert.ok(isValidAccountType('Asset', 'Bank'));
  assert.ok(isValidAccountType('Asset', 'Cash'));
  assert.ok(isValidAccountType('Liability', 'Payable'));
  assert.ok(!isValidAccountType('Revenue', 'Bank'));   // wrong classification
  assert.ok(!isValidAccountType('Asset', 'Checking'));  // not curated
});
```

**Step 2 — run, expect FAIL** (export not defined): `cd backend && node --test __tests__/lib/finance/chartOfAccounts.test.js`

**Step 3 — implement.** In `chartOfAccounts.js` add (values grounded in `DEFAULT_COA` + `AUTO_ACCOUNT_TYPE`):
```js
export const ACCOUNT_TYPES_BY_CLASSIFICATION = Object.freeze({
  Asset: ['Asset', 'Cash', 'Bank', 'Receivable', 'Suspense'],
  Liability: ['Liability', 'Payable'],
  Equity: ['Equity'],
  Revenue: ['Revenue'],
  Expense: ['Expense'],
});
export function isValidAccountType(classification, accountType) {
  return (ACCOUNT_TYPES_BY_CLASSIFICATION[classification] || []).includes(accountType);
}
```
Add both to the `export default { … }` block.

**Step 4 — run, expect PASS.** **Step 5 — commit** `feat(finance): curated COA account_type enum + per-classification validation`.

### Task 2: Manual-account factory (id + code) helper

**Files:** Modify `chartOfAccounts.js`; Test same file.

A manual account needs a name-derived id (`autoAccountId`, immutable, concurrency-safe) and an auto-assigned code (`nextCodeForClassification`). Add a pure `buildManualAccount({ tenantId, classification, name, account_type, existingCodes })` that returns the account object (mirrors `resolveAccount`'s created branch but for an explicit type), or assert the implementer reuses `resolveAccount` + overrides `account_type`. Test: created account has `is_system:false`, `is_active:true`, name-derived id, a code in the classification's reserved range, and the supplied `account_type`. Commit `feat(finance): manual COA account factory`.

---

## Phase 2 — Event fold (`financeDomainReplay.js`) + `source` enum

### Task 3: `account.created.source` enum on the auto-create path

**Files:** Modify `backend/lib/finance/financeDomainService.js` (the `finance.account.created` emission ~line 475) + `financeDomainReplay.js` (fold ~line 78). Test: `backend/__tests__/lib/finance/financeDomainService.coa.test.js`.

- Add `source: 'auto_resolution'` to the auto-create event payload.
- Replay fold (`account.created`) carries `source` and `is_active` onto the folded account (default `is_active:true`, `source: payload.source || 'auto_resolution'`).
- Failing test: after an auto-create journal draft, the folded account has `source:'auto_resolution'`. Commit.

### Task 4: Replay fold for `account.updated` + `account.deactivated`

**Files:** Modify `financeDomainReplay.js`; Test: `backend/__tests__/lib/finance/financeDomainReplay.test.js` (create if absent).

**Failing tests** — feed a hand-built event array to `rebuildBucketFromEvents`:
```js
// account.created then account.updated(account_type Bank, name 'Ops Bank') → chart shows the edit
// account.deactivated → folded account is_active === false
// account.updated with is_active:true after deactivate → is_active === true (reactivate)
```
**Implement** two new `switch` cases that upsert by `payload.account.id` (updated) / flip `is_active` (deactivated), mirroring the `account.created` case shape. The `updated` event carries the **full account snapshot** under `payload.account`. Run, pass, commit `feat(finance): replay fold for account.updated/deactivated`.

---

## Phase 3 — Domain methods (`financeDomainService.js`)

> Shared helpers first. All methods follow the house pattern: resolve bucket → `evaluateFinanceGovernance` (AI fail-closed) → validate (throw with `statusCode` + `code`) → **append-before-mutate** → fold into `getTenantCoa`. Reason lives in the event payload.

### Task 5: `hasPostedHistory` + `accountBalanceCents` helpers

**Files:** Modify `financeDomainService.js`; Test: `backend/__tests__/lib/finance/financeDomainService.coa-manager.test.js` (new).

- `hasPostedHistory(bucket, accountId)` → any `posted`/`reversed` journal line references `accountId`.
- `accountBalanceCents(bucket, accountId)` → net debit−credit over `posted`/`reversed` lines for that id (or read from `getLedger`).
- Failing tests with seeded posted entries (`seedJournalEntry`). Commit.

### Task 6: `createAccount`

**Files:** `financeDomainService.js` (+ method in the returned object); Test: `…coa-manager.test.js`.

Signature: `createAccount({ tenantId, actor, payload: { name, classification, account_type }, requestId, braidTraceId })`.
Validation (each throws `err.statusCode`/`err.code`):
- AI actor → governance block (`ManageChartOfAccountsCommand`; relies on the fail-closed default). Code `FINANCE_COA_AI_FORBIDDEN` (403).
- classification ∉ 5 values → `FINANCE_COA_INVALID_CLASSIFICATION` (400).
- `!isValidAccountType` → `FINANCE_COA_INVALID_ACCOUNT_TYPE` (400).
- normalized `(classification, name)` exists → `FINANCE_COA_DUPLICATE_NAME` (409).
Then build the manual account (Task 2), append `finance.account.created` with `source:'manual'`, fold, return the account.
**Tests:** happy path; each rejection; emitted event has `source:'manual'`; AI actor 403. Commit.

### Task 7: `updateAccount` (the lock rules — server-enforced)

Signature: `updateAccount({ tenantId, actor, accountId, payload: { name?, classification?, account_code?, account_type?, reason? }, … })`.
Rules (design §2):
- not found → `FINANCE_COA_ACCOUNT_NOT_FOUND` (404).
- `is_system` → `FINANCE_COA_SYSTEM_ACCOUNT_LOCKED` (409) for ANY field.
- if `hasPostedHistory`: only `name` + `account_type` permitted; a `classification`/`account_code` change → `FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY` (409); `reason` **required** → else `FINANCE_COA_REASON_REQUIRED` (400).
- no history: full edit allowed; `reason` optional.
- type/name/code/classification changes re-validate (`isValidAccountType`, dup-name, dup-code → `FINANCE_COA_DUPLICATE_*`).
Append `finance.account.updated` with the full post-edit snapshot (+ `reason`), fold, return.
**Tests:** no-history full edit; posted-history allows name+type; posted-history rejects classification & code; posted-history without reason → 400; system locked; dup-name/-code; invalid type. Commit.

### Task 8: `deactivateAccount`

Signature: `deactivateAccount({ tenantId, actor, accountId, payload: { reason }, … })`.
- not found → 404; `is_system` → `FINANCE_COA_SYSTEM_ACCOUNT_LOCKED`; missing `reason` → `FINANCE_COA_REASON_REQUIRED`; `accountBalanceCents !== 0` → `FINANCE_COA_DEACTIVATE_NONZERO_BALANCE` (409).
- **Already inactive (non-system) → idempotent no-op: return the account, append NO new event.** (Confirmed.)
- Else append `finance.account.deactivated` (+ reason), fold (`is_active:false`).
**Tests:** success; system blocked; nonzero-balance blocked; missing-reason 400; **deactivating an already-inactive account emits no second event (idempotent)**. Commit.

### Task 9: `reactivateAccount`

Signature: `reactivateAccount({ tenantId, actor, accountId, payload: { reason }, … })`.
- not found → 404; `is_system` → locked; **currently active → `FINANCE_COA_NOT_INACTIVE` (409)** (confirmed); missing reason → 400.
- **Re-run uniqueness** vs currently-active accounts: code or normalized `(classification,name)` conflict → `FINANCE_COA_REACTIVATE_CONFLICT` (409).
- Else append `finance.account.updated` with `is_active:true` (same id) + reason, fold.
**Tests:** success (id preserved); conflict blocked; system blocked; already-active 409. Commit.

### Task 10: Wire methods into the service return object

Ensure `createAccount/updateAccount/deactivateAccount/reactivateAccount` are on the returned service object. Add a `ManageChartOfAccountsCommand` constant where command types live. Run the full finance lib suite green. Commit.

---

## Phase 4 — Routes (`finance.v2.js`)

### Task 11: RBAC gate investigation + helper

**Files:** read `backend/routes/permissions.js`, `users.js`, and the user/role model. Determine whether a granular `finance.accounts.manage` capability is expressible. Implement a small `requireCoaManage(req)` check used by the four routes:
- If the RBAC model supports capabilities → check `finance.accounts.manage`.
- Else → fall back to the closest finance-management role and **record the deviation** in the design doc + CHANGELOG.
- Failure → `FINANCE_COA_FORBIDDEN` (403).
Commit (with a note on which path was taken).

### Task 12: `POST /accounts` route

Mirror the `POST /draft-invoices` template (`runWrite`, `buildActor`, `sendError`, `req.financeTenantId`). 201 on success. **Test** (`backend/__tests__/routes/finance.v2.coa-routes.test.js`, new, mirror `finance.v2.read-routes.test.js` harness): happy 201; AI actor 403 `FINANCE_COA_AI_FORBIDDEN`; invalid type 400; RBAC 403. Commit.

### Task 13: `PATCH /accounts/:id` route

Mirror `PATCH /draft-invoices/:id`. **Tests:** happy; posted-history lock 409; system lock 409; missing-reason 400. Commit.

### Task 14: `POST /accounts/:id/deactivate` + `/reactivate` routes

Two routes → `deactivateAccount`/`reactivateAccount`. **Tests:** deactivate success/balance-blocked/system-blocked; reactivate success/conflict. Commit.

### Task 15: Persistent partition test

Extend `backend/__tests__/routes/finance.v2.persistentWrites.test.js`: a COA create in test mode stamps `is_test_data` and folds only into the test partition; `GET /accounts` for the live partition does not show it; an unresolved data mode → 503 (fail-closed, mirrors the other writes). Commit.

---

## Phase 5 — Frontend (`ChartOfAccountsPanel.jsx`)

### Task 16: API client methods

**Files:** `src/api/finance.js` (ensure `getAccounts` surfaces `is_active`,`source`), `src/api/financeWrites.js` (add `createAccount`, `updateAccount`, `deactivateAccount`, `reactivateAccount` mirroring `simulatePostedDealWon`'s shape). Vitest unit tests for the client calls. Commit.

### Task 17: Create-account form

Add a "New account" form to the panel: name input, classification `<select>` (5 values), `account_type` `<select>` filtered by `ACCOUNT_TYPES_BY_CLASSIFICATION`. On submit → `createAccount`, refresh, `clearCacheByKey`. **Vitest** (`ChartOfAccountsPanel.test.jsx`): renders form, type dropdown filters by classification, submit calls the client. Commit.

### Task 18: Edit + reason (lock rendering)

Per-row Edit: fields disabled per lock rules (system row → no edit affordance; posted-history row → classification/code disabled); a reason field appears when required. Server remains the authority — UI mirrors it. **Tests** assert disabled states + reason gating. Commit.

### Task 19: Deactivate/Reactivate toggle + active filter + error surfacing

Toggle (hidden for system), an active/inactive filter, and surfacing the structured-error reason on rejection. **Tests:** toggle calls the right client; filter hides inactive; a rejection renders the error code's message. Commit.

---

## Phase 6 — Integration + docs

### Task 20: #10-retirement integration test (leverages live Bridge B)

**File:** `backend/__tests__/lib/finance/financeDomainService.coa-manager.test.js` (or a dedicated integration test). Explicitly labelled: create a custom-named Asset account, set its `account_type` to `Bank` via `updateAccount`, post a journal line against it (simulate + approve), then assert it appears in `service.getCashFlow(tenant)` (`cash_account_codes` includes it; the receipt is an inflow). Note in the test comment that this is valid because Cash Flow Bridge B is merged (#650). Commit.

### Task 21: Docs

- `CHANGELOG.md`: Added — editable COA manager (create/edit/deactivate/reactivate, curated types, server-enforced locks, structured `FINANCE_COA_*` codes, human-only, event-sourced, in-memory-first).
- `docs/architecture/finance/finance-ops-beta-limitations.md`: **retire / re-scope limitation #10** — custom-named bank/cash accounts can now be marked `Bank`/`Cash`; note any residual (e.g. system-account renaming still deferred).
- `docs/architecture/finance/finance-ops-IMPLEMENTATION-STATUS.md`: mark COA editable manager implemented.
- Record the RBAC path chosen (Task 11). Commit (docs-only → `--no-verify` ok).

### Task 22: Full regression + open PR

Run `cd backend && node --test "__tests__/lib/finance/**/*.test.js" "__tests__/routes/finance*.test.js"` (all green) + `npm run test:run` (frontend) + lint. Push the branch, open the PR, await Codex review, address findings at the root (same bar as #650). Do not merge without explicit authorization.

---

## Notes / risks
- **AI blocking is largely free:** the governance default already fail-closes `ai_agent`; still assert it explicitly per method + route.
- **Reason storage:** `reason` is audit metadata in the event payload — never PII-validated, but trim + length-cap it.
- **No migration:** the `finance.accounts` table stays unused; do not write to it (Approach B is deferred).
- **Partition correctness** is the subtle part — Task 15 must prove test/live isolation for COA events.
