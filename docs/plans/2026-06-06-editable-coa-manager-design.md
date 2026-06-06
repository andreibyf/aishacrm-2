# Editable Chart of Accounts Manager — Design

**Date:** 2026-06-06
**Status:** Design approved (brainstorming) — ready for implementation plan
**Author:** Dre + Claude (Opus 4.8)

**Goal:** Let a tenant create, edit, and deactivate/reactivate chart-of-accounts accounts — and set a curated `account_type` (incl. `Bank`/`Cash`) — retiring **beta limitation #10** (custom-named bank/cash accounts can't be recognized by the cash-flow statement until a tenant can mark them `Bank`/`Cash`).

**Architecture:** Approach A — **pure event-sourced**, consistent with COA Slice 1 / Cash Flow Slice 2. COA mutations append `finance.account.*` events that the replay fold + `getTenantCoa` apply to the in-memory chart. The `finance.accounts` table (migration 172) stays unused this slice; its materialization is deferred to the persistent-activation / provider-mapping work.

**Tech stack:** Node domain service (`financeDomainService.js`) + event store, V2 Express routes (`finance.v2.js`), React panel (`ChartOfAccountsPanel.jsx`), Node native test runner + Vitest.

---

## 1. Event model & account identity

Three append-only events (validated by the existing `finance.*` pattern in `assertCanonicalEventType` — **no registry change**), folded into the chart by `financeDomainReplay.js` + `getTenantCoa`:

| Event | When | Payload (additions) |
| --- | --- | --- |
| `finance.account.created` | create (manual) **and** existing auto-create | `source: 'manual' \| 'auto_resolution'` (explicit enum) |
| `finance.account.updated` | edit / reactivate | full post-edit account snapshot + `reason` (when required) |
| `finance.account.deactivated` | deactivate | account id + `reason` |

- **Identity is immutable.** A manual account mints a **name-derived id** (`autoAccountId(tenantId, classification, name)`, concurrency-safe per Codex #647); `account_code` is display/control metadata, never identity. Renaming never changes the id, so id-matched posted history (Slice 1 wired `journal_lines.account_id`) is stable across renames.
- The existing auto-create path is updated to stamp `source: 'auto_resolution'`; the manager stamps `source: 'manual'`.
- The fold upserts the account by id (created/updated) and flips `is_active` (deactivated / updated-with-`is_active`). Baseline system accounts remain re-seeded on access (not events), exactly as today.

## 2. Operations & validation (server-enforced)

**All lock rules are enforced in the domain service — UI hiding is presentation only, never the authority.** Every failure returns a **stable structured error code** (see §6).

**Curated `account_type` enum (closed), valid per classification:**

| Classification | Allowed `account_type` |
| --- | --- |
| Asset | `Cash`, `Bank`, `Receivable`, `Suspense`, `Asset` (generic) |
| Liability | `Payable`, `Liability` (generic) |
| Equity | `Equity` |
| Revenue | `Revenue` |
| Expense | `Expense` |

`account_type` must be valid for the chosen `classification` (e.g. `Bank` cannot be set on a Revenue account).

**Create** — `{ name, classification (5-value enum), account_type (curated) }`:
- `account_code` auto-assigned: next free in the classification's reserved range (`nextCodeForClassification`), with `unique(tenant_id, account_code)` as the backstop.
- Reject if a normalized `(classification, name)` already matches an existing account (`normalizeAccountKey`) — prevents the fragmentation #10 is about.
- `is_system = false`, `is_active = true`. No `reason` required.

**Edit** (`PATCH`):
- **System/seeded account → fully locked.** No field is editable (name, classification, code, `account_type` all rejected) and it cannot be deactivated. (Their names back the cash-flow name-match; renaming is unsafe. Revisit in a later slice.)
- **Account with posted history → display `name` + `account_type` only.** `classification` and `account_code` are **locked**. A `reason` is **required**.
- **Account with no posted history → full edit** (name, classification, code, type). No `reason` required.
- "Has posted history" = the `account_id` appears in any `posted`/`reversed` journal line in the active partition.

**Deactivate** (`POST :id/deactivate`, `reason` **required**):
- Blocked if `is_system`.
- Blocked if the account has a **nonzero posted balance** (from the ledger projection).
- Else `is_active = false`; the account stays in the chart + all historical statements, but is removed from new journal-line account pickers.

**Reactivate** (`POST :id/reactivate`, `reason` **required**):
- **Non-system, currently-inactive accounts only.** Preserves the same account id; audited.
- Re-runs uniqueness checks against currently **active** accounts: blocked if `account_code` **or** normalized `(classification, name)` now conflicts with another active account.

**Governance:** all four mutations are **human-only** — an `ai_agent` actor is blocked before any write (new COA-management command type in `evaluateFinanceGovernance`). AI may read the chart, never mutate it.

## 3. API surface

All via the persistent-aware `runWrite` (partition-stamped), human-gated, RBAC-gated (§5):

| Method | Route | Body |
| --- | --- | --- |
| `POST` | `/api/v2/finance/accounts` | `{ name, classification, account_type }` |
| `PATCH` | `/api/v2/finance/accounts/:id` | subset of `{ name, classification, account_code, account_type, reason }` |
| `POST` | `/api/v2/finance/accounts/:id/deactivate` | `{ reason }` |
| `POST` | `/api/v2/finance/accounts/:id/reactivate` | `{ reason }` |

`GET /api/v2/finance/accounts` (existing) lists the chart and now surfaces `is_active` and `source`. Each route → a domain method (`createAccount` / `updateAccount` / `deactivateAccount` / `reactivateAccount`).

## 4. UI surface

`ChartOfAccountsPanel.jsx` (today read-only) gains:
- **New account** form — name, classification dropdown, curated `account_type` dropdown (filtered by classification).
- Per-row **Edit** — fields disabled per the lock rules (server is still the authority); **entirely hidden for system accounts**. A `reason` field appears when required.
- **Deactivate / Reactivate** toggle — hidden for system accounts; the server enforces the balance/uniqueness guards and the UI surfaces the rejection reason (from the structured error code).
- An **active/inactive filter**.

Edits target the active Test/Live partition (§7).

## 5. RBAC

Gate the four routes behind a **narrow capability — `finance.accounts.manage`** — per the RBAC & Access Matrix (Track E, #626), not a broad finance-manage permission. If the existing RBAC model cannot express a capability this granular, fall back to the closest finance-management permission and record the deviation. (Confirmed during planning.) AI-actor blocking (§2) is independent of and in addition to RBAC.

**RBAC deviation as implemented (2026-06-06):** the repo's RBAC model has only coarse roles (`superadmin`/`admin`/`manager`/`user`/`employee`) and `perm_*` booleans — there is **no** `finance.accounts.manage` capability, and the RBAC & Access Matrix (Track E, #626) explicitly records that a finance-admin/finance-viewer split does **not** exist yet (Deferred). So the narrow capability is **not expressible** today. Per the documented fallback, the four routes are gated by the closest existing permission — **tenant `admin` OR `superadmin`** (`isSuperAdmin(req) || role === 'admin'`), throwing `403 FINANCE_COA_FORBIDDEN` on failure (`backend/routes/finance.v2.js`, `requireCoaManage` helper). COA management is a structural finance-config change, so admin is the natural floor. The gate is isolated in a single helper body so that **when a true `finance.accounts.manage` capability lands, only that body changes** — the four route call-sites and the `FINANCE_COA_FORBIDDEN` contract stay put. AI-actor blocking remains independent of and in addition to this gate.

## 6. Structured error codes

Stable codes on every validation/authorization failure (HTTP in parentheses):

| Code | Meaning | HTTP |
| --- | --- | --- |
| `FINANCE_COA_ACCOUNT_NOT_FOUND` | unknown `:id` (or wrong tenant) | 404 |
| `FINANCE_COA_INVALID_CLASSIFICATION` | classification not in the 5-value enum | 400 |
| `FINANCE_COA_INVALID_ACCOUNT_TYPE` | type not curated, or invalid for the classification | 400 |
| `FINANCE_COA_INVALID_NAME` | missing/blank account name | 400 |
| `FINANCE_COA_DUPLICATE_NAME` | normalized `(classification, name)` already exists | 409 |
| `FINANCE_COA_NAME_RESERVED` | the (name-derived) id is held by a renamed-away account — old name can't be reused (create or journal auto-create) | 409 |
| `FINANCE_COA_DUPLICATE_CODE` | `account_code` collides within the tenant | 409 |
| `FINANCE_COA_SYSTEM_ACCOUNT_LOCKED` | edit/deactivate of a system account | 409 |
| `FINANCE_COA_FIELD_LOCKED_POSTED_HISTORY` | classification/code edit on a posted-history account | 409 |
| `FINANCE_COA_DEACTIVATE_NONZERO_BALANCE` | deactivate with a nonzero posted balance | 409 |
| `FINANCE_COA_ACCOUNT_INACTIVE` | a journal draft line posts to a deactivated account (deactivation enforced in the journal-resolution path) | 409 |
| `FINANCE_COA_REASON_REQUIRED` | missing `reason` for deactivate/reactivate/posted-history edit | 400 |
| `FINANCE_COA_NOT_INACTIVE` | reactivate an already-active account | 409 |
| `FINANCE_COA_REACTIVATE_CONFLICT` | reactivate would collide on code or name | 409 |
| `FINANCE_COA_AI_FORBIDDEN` | an `ai_agent` actor attempted a COA mutation | 403 |
| `FINANCE_COA_FORBIDDEN` | caller lacks `finance.accounts.manage` | 403 |

## 7. Test/Live partition behavior (Approach A)

COA events are partition-stamped like every other finance event: `runWrite` stamps each appended envelope with `is_test_data` for the active data mode, and `foldChartOfAccounts` / `getTenantCoa` are partition-aware. Therefore:
- A COA mutation made in **Test** mode folds only into the **test** partition's chart; **Live** has its own independent chart. `GET /accounts` already resolves the active partition.
- All validations (duplicate name/code, has-posted-history, nonzero-balance, reactivate uniqueness) are evaluated **within the active partition** — a name used only in Live does not block creating it in Test.
- **In-memory mode** (the default, flag-off) is unpartitioned: a single chart, exactly as today.
- Fail-closed posture matches the other writes: if the data mode cannot be resolved in persistent mode, `runWrite` refuses (503), so a COA edit never lands in the wrong partition.

## 8. Testing

**Slice 1 (this slice) acceptance — COA CRUD + replay:**
- Domain unit tests for every §2 rule: create (happy, dup-name reject, curated-type + per-classification validation, code auto-assignment); update (no-history full edit; posted-history restricted to name+type with classification/code locked; system fully locked; reason-required); deactivate (system blocked, nonzero-balance blocked, success); reactivate (non-system only, id preserved, uniqueness re-check conflict + success).
- **Replay/fold tests:** after `account.updated` (incl. an `account_type` change) and `account.deactivated`, a rebuilt chart reflects the edits and `is_active` — i.e. **an `account_type` change is replayed and visible in `GET /accounts`**. (Slice 1 proves replay + visibility; it does **not** assert `/cash-flow` behavior.)
- Route tests: each route happy-path + `FINANCE_COA_AI_FORBIDDEN` (403 for AI) + RBAC 403 + the §6 validation 4xx codes.
- Frontend: panel renders the affordances, respects the lock rules (system hidden, posted-history fields disabled, reason field appears), and surfaces rejection reasons.

**#10-retirement integration test (valid because Cash Flow Bridge B is already merged, PR #650):**
- Set a custom-named account's `account_type` to `Bank`, post a journal line against it, and assert it now appears in `GET /cash-flow`. This is an explicitly-labelled integration test that leverages the **already-live** Bridge B; it is **not** part of the COA-CRUD acceptance and makes no `/cash-flow` claim that isn't already implemented.

## 9. Activation posture & out of scope

- **In-memory-first; no migration, no env-flag flip, no provider writes, no staging/prod mutation.** Events fold in both modes; the persistent path works unchanged when `ENABLE_FINANCE_PERSISTENT_EVENTS` eventually flips.
- **Out of scope (deferred):** materializing the `finance.accounts` table (Approach B); editing/renaming system accounts; custom (non-curated) account types; account hierarchy/`parent_account_id` editing; provider-COA mapping. These belong to the persistent-activation / provider-integration work.

---

🤖 Generated with [Claude Code](https://claude.com/claude-code)
