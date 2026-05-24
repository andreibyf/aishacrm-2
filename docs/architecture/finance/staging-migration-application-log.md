# Finance Ops — Phase 3-2: Staging Migration Application Log (Preflight Review)

**Phase 3-2 — Controlled Staging Activation, Migration Application.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Preflight review document. **No migration applied by this task.** No DB connection opened, no SQL executed, no staging or production mutation, no environment variable changed.
**Date:** 2026-05-23
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1) ·
[`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) (2C-1) ·
[`persistent-projection-store-plan.md`](./persistent-projection-store-plan.md) (2C-4) ·
[`security-rls-hardening.md`](./security-rls-hardening.md) ·
[`staging-rls-validation.md`](./staging-rls-validation.md) (2B-14) ·
[`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md) (2C-2) ·
[`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) (2C-3) ·
[`event-store-persistence.md`](./event-store-persistence.md) ·
[`projection-runtime.md`](./projection-runtime.md)

---

## 1. Purpose and scope

This is the **preflight application log** for Phase 3-2 — applying finance migrations 168, 169, 170, 171 to **staging only**. It inventories each migration against its actual file contents (not memory or prior doc summaries), confirms each is appropriate for staging-only / dev-draft application, fixes the intended application order, lists the preflight checks an operator runs before issuing any `psql` or Supabase MCP `apply_migration` call, and records the rollback/restore posture.

**This document is a review and a runbook. It does not apply migrations.** Application is a separate operator action gated by §5 preflight and §6 rollback awareness, performed against the staging Supabase project only.

---

## 2. Migration inventory (verified against file contents)

Reviewer note: every row below was reconciled against the actual SQL in `backend/migrations/`. Names, table counts, trigger counts, policy counts, and append-only / immutability postures all match the file as of baseline commit `83bb41d1`. Where a prior doc (including this author's own Phase 3-1 plan §6 and earlier CHANGELOG entries) misnamed migration 171 or understated its scope, the discrepancy is called out in §2.5 and superseded here.

### 2.1 Migration 168 — `168_finance_ops_runtime_scaffold.sql`

| Field               | Value                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| File                | `backend/migrations/168_finance_ops_runtime_scaffold.sql`                                                                                             |
| Header posture      | "Dev-only draft schema. Do not apply to production without review."                                                                                   |
| Creates             | `finance` schema; 8 tables (`accounts`, `journal_entries`, `journal_lines`, `invoices`, `invoice_lines`, `approvals`, `audit_events`, `adapter_jobs`) |
| Indexes             | 7 (tenant_id-leading on each major table; `audit_events` indexed by `(tenant_id, created_at desc)` at this stage)                                     |
| Functions           | 1 — `finance.validate_journal_entry_balance(uuid) returns boolean` (stable; pure helper)                                                              |
| RLS                 | Intentionally **not enabled** — placeholders only, commented out at the bottom (RLS belongs to migration 171)                                         |
| Touches `public.*`? | No                                                                                                                                                    |
| Idempotent?         | Yes — every `create table` is `if not exists`; every `create index` is `if not exists`; functions use `create or replace`                             |
| Reversibility       | Additive only; rollback is `drop schema finance cascade` (last resort; see §6)                                                                        |
| Staging-only?       | **Yes** — header explicitly excludes production without review                                                                                        |

### 2.2 Migration 169 — `169_finance_event_store_append_only.sql`

| Field                   | Value                                                                                                                                                                                               |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File                    | `backend/migrations/169_finance_event_store_append_only.sql`                                                                                                                                        |
| Header posture          | "Dev-only draft. Do NOT apply to staging/production until the Track F migration readiness checklist clears."                                                                                        |
| Creates                 | Function `finance.audit_events_immutable()`; 3 triggers on `finance.audit_events` (no-update, no-delete, no-truncate); 1 replay index `idx_finance_audit_events_replay (tenant_id, created_at, id)` |
| Hardens                 | `finance.audit_events` (created in 168) into the append-only persistent event store — the canonical Postgres-backed finance event stream                                                            |
| Append-only enforcement | UPDATE / DELETE / TRUNCATE blocked for every role, **including** `service_role` (BEFORE trigger runs before RLS bypass)                                                                             |
| Touches `public.*`?     | No                                                                                                                                                                                                  |
| Idempotent?             | Yes — `create or replace function`; `drop trigger if exists` before each `create trigger`; `create index if not exists`                                                                             |
| Reversibility           | Drop the three triggers and the replay index; rollback does not require dropping the table                                                                                                          |
| Staging-only?           | **Yes** — header explicitly gates on the Track F readiness checklist                                                                                                                                |
| Depends on              | Migration 168 (operates on `finance.audit_events`)                                                                                                                                                  |

### 2.3 Migration 170 — `170_finance_projection_state_draft.sql`

| Field               | Value                                                                                                                                                                                                                                                                                                                             |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| File                | `backend/migrations/170_finance_projection_state_draft.sql`                                                                                                                                                                                                                                                                       |
| Header posture      | "Dev-only DRAFT. Do NOT apply to staging/production until the staging-readiness gate clears."                                                                                                                                                                                                                                     |
| Creates             | Table `finance.projection_state` (composite PK `(projection_name, tenant_id)`); 1 check constraint `finance_projection_state_cursor_pair_chk`; 1 index `idx_finance_projection_state_tenant_status`; function `finance.set_projection_state_updated_at()`; 1 BEFORE UPDATE trigger that stamps `updated_at` on every row mutation |
| Append-only?        | **No** — intentionally mutable. `state_json` is a durable cache of derived state, rebuilt by `replay()` from the event stream which remains the source of truth. No no-hard-delete trigger here (see §2.4 — migration 171 also does not add one for this table)                                                                   |
| Touches `public.*`? | No                                                                                                                                                                                                                                                                                                                                |
| Idempotent?         | Yes — `create table if not exists`; `drop constraint if exists` before `add constraint`; `create or replace function`; `drop trigger if exists` before `create trigger`; `create index if not exists`                                                                                                                             |
| Reversibility       | Drop the trigger, drop the function, drop the constraint, drop the table. Rebuildable by `replay()` from `finance.audit_events` after re-creation                                                                                                                                                                                 |
| Staging-only?       | **Yes** — header explicitly gates on the staging-readiness gate                                                                                                                                                                                                                                                                   |
| Depends on          | Migration 168 (depends on `finance` schema)                                                                                                                                                                                                                                                                                       |

### 2.4 Migration 171 — `171_finance_rls_policies.sql`

| Field                       | Value                                                                                                                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| File                        | `backend/migrations/171_finance_rls_policies.sql`                                                                                                                                                                                                                                                                                                                                                                              |
| Header posture              | "Dev-only DRAFT. Do NOT apply to staging/production until the Phase 3-2 staging-readiness review clears."                                                                                                                                                                                                                                                                                                                      |
| Scope                       | **Full finance RLS rollup** — enables Row-Level Security on **all 9** finance tables (8 from 168 + `projection_state` from 170) and installs the finalized policy set and the no-hard-delete ledger triggers                                                                                                                                                                                                                   |
| `enable row level security` | `accounts`, `journal_entries`, `journal_lines`, `invoices`, `invoice_lines`, `approvals`, `audit_events`, `adapter_jobs`, `projection_state`                                                                                                                                                                                                                                                                                   |
| Policies (per table)        | tenant_match SELECT (`tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid) or (select auth.role()) = 'service_role'`); service_only INSERT/UPDATE; DENY `using (false)` DELETE on ledger tables. `projection_state` deliberately omits a DELETE policy (rebuildable cache, service_role may delete/truncate). `journal_lines` and `audit_events` carry a stricter `for update using (false)` policy (deny update entirely). |
| Policy count                | 35 policies in total: 4 policies × 8 tables = 32, plus 3 policies for `projection_state` (no DELETE policy)                                                                                                                                                                                                                                                                                                                    |
| No-hard-delete triggers     | Function `finance.prevent_hard_delete()` (unconditional — applied to `journal_entries`, `journal_lines`, `audit_events`); function `finance.prevent_hard_delete_posted()` (conditional — applied to `invoices`, `approvals`, blocks delete only when `status != 'draft'`). Total: 5 BEFORE DELETE triggers.                                                                                                                    |
| Service_role behavior       | `service_role` bypasses RLS entirely. The no-hard-delete triggers are the authoritative guard against `service_role` deletes on immutable ledger rows; `audit_events` UPDATE/DELETE/TRUNCATE is additionally guarded by the append-only triggers from migration 169.                                                                                                                                                           |
| Touches `public.*`?         | No                                                                                                                                                                                                                                                                                                                                                                                                                             |
| Idempotent?                 | Yes — every policy uses `drop policy if exists` then `create policy`; functions use `create or replace`; every trigger uses `drop trigger if exists` then `create trigger`; `enable row level security` is idempotent                                                                                                                                                                                                          |
| Reversibility               | Drop the 5 triggers, drop the 2 functions, drop the 35 policies, `alter table … disable row level security` on each of the 9 tables. None of the migration's effects mutate data.                                                                                                                                                                                                                                              |
| Staging-only?               | **Yes** — header explicitly gates on the Phase 3-2 staging-readiness review                                                                                                                                                                                                                                                                                                                                                    |
| Depends on                  | Migrations 168 and 170 (covers tables created by both)                                                                                                                                                                                                                                                                                                                                                                         |

### 2.5 Migration 171 — naming / scope reconciliation (mismatch flagged)

Migration 171 is the **full finance RLS rollup**, not a narrow companion to 170. Prior docs have under-described it:

| Prior doc                                                   | What it said                                                                                                   | Reality (per the actual file contents)                                                                                    |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `phase-3-staging-activation-plan.md` §6 (commit `cbd1a65c`) | "`171_finance_projection_state_rls_draft.sql` — Companion RLS for `finance.projection_state`. Dev-only draft." | Actual file is `171_finance_rls_policies.sql`. It is the full RLS rollup covering all 9 tables + no-hard-delete triggers. |
| CHANGELOG entry for Slice 1 Task 1 (commit `1b322a3f`)      | "add companion RLS migration 171 (dev-only draft)"                                                             | Same — under-describes scope.                                                                                             |
| Slice 1 omnibus CHANGELOG entry                             | "**Task 1** adds dev-only draft migration `171_finance_projection_state_rls_draft.sql` (RLS companion to 170)" | Same — wrong filename and under-described scope.                                                                          |

**This doc supersedes those characterizations for Phase 3-2 onwards.** Migration 171 is `171_finance_rls_policies.sql` — the full finance RLS rollup. The scaffold is updated alongside this doc to reflect the correct name and scope.

The underlying migration **code** is correct (matches `security-rls-hardening.md` §2 and `phase-2c-rls-application-plan.md` §3); only the prose descriptions in upstream docs are stale. No code change is required for this fix; this is the doc-reconciliation pass.

---

## 3. Application order

Apply migrations in strict numeric order. Each later migration depends on objects created by an earlier one — running out of order will fail loudly (`relation "finance.audit_events" does not exist`, etc.). The order is:

1. **168** — `168_finance_ops_runtime_scaffold.sql` — creates `finance` schema and 8 tables.
2. **169** — `169_finance_event_store_append_only.sql` — append-only triggers on `finance.audit_events` + replay index.
3. **170** — `170_finance_projection_state_draft.sql` — creates `finance.projection_state` + updated_at trigger.
4. **171** — `171_finance_rls_policies.sql` — enables RLS on all 9 tables + 35 policies + 5 no-hard-delete triggers.

**Do not skip 169 between 168 and 171.** 169 is what makes `finance.audit_events` append-only; if 171 lands first, the RLS policies are in place but the table is still mutable until 169 lands. The window is harmless on an empty table (no events yet to corrupt), but the canonical order eliminates the ambiguity.

**Do not apply 171 before 170.** 171 includes `enable row level security` on `finance.projection_state` and a SELECT / INSERT / UPDATE policy set for it — that requires the table to exist.

---

## 4. Application targets (staging only)

| Target                                          | Phase 3-2 posture                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Staging Supabase project (Doppler `stg_stg`)    | **Application target** — gated by §5 preflight                                                           |
| Production Supabase project (Doppler `prd_prd`) | **Not a target.** Production is explicitly out of scope for Phase 3-2 and for the entire Phase 3 arc.    |
| Dev Supabase project (Doppler `dev`)            | Not the Phase 3-2 target. Migrations may already be present in dev (they are dev-only drafts by design). |
| Local dev DB                                    | Not the Phase 3-2 target.                                                                                |

---

## 5. Preflight checks (before any apply)

The operator runs these before issuing any apply command. **Failing any check halts the apply.**

### 5.1 Source-of-truth checks (codebase)

- [ ] Branch is `feat/finance-ops-runtime` (or a descendant fork explicitly recorded in `phase-3-staging-activation-plan.md` §2.1).
- [ ] Baseline commit at apply time is `83bb41d1` or a descendant. Re-run `git rev-parse HEAD` and compare.
- [ ] Verification baseline is still green at the apply commit: `node --test backend/__tests__/lib/finance/*.test.js backend/__tests__/lib/finance/projections/*.test.js backend/__tests__/routes/finance.v2.routes.test.js backend/__tests__/workers/financeProjectionWorker.test.js` returns **278/278 pass**. A drift from 278/278 is a Phase 3 stop condition (`phase-3-staging-activation-plan.md` §2.2).
- [ ] Lint clean: `npm run lint -- --quiet` returns no errors.
- [ ] No uncommitted change to any file under `backend/migrations/16[8-9]_*.sql` or `backend/migrations/17[01]_*.sql`. `git status` for the four files must show clean.

### 5.2 Staging-readiness checks (per Phase 2C deliverables)

- [ ] `staging-rls-validation.md` (2B-14) preflight is clear — specifically, the JWT `tenant_id` claim shape has been confirmed against the staging auth setup (the RLS policies in 171 hard-code `auth.jwt() ->> 'tenant_id'`).
- [ ] `postgrest-isolation-verification.md` (2C-2) confirms the `finance` schema is **not** in the staging `supabase/config.toml` exposed schemas list (`["public", "graphql_public"]` only). A finance schema exposure is a Phase 3 stop condition.
- [ ] `service-role-tenant-claim-verification.md` (2C-3) confirms `select auth.role()` returns `'service_role'` for the backend's connection in staging.
- [ ] `phase-2c-rls-application-plan.md` (2C-1) §7 readiness checklist is clear for migrations 168/169 application.

### 5.3 Environment posture checks (the hard constraints from Phase 3-1 §7-9)

- [ ] `ENABLE_FINANCE_OPS` is **unset (or not `'true'`)** in the staging backend Doppler config (`stg_stg`) at apply time. Migrations 168-171 are schema changes; the route mount remains gated by `ENABLE_FINANCE_OPS` independently. Setting `ENABLE_FINANCE_OPS=true` is Phase 3-7, not 3-2.
- [ ] `ENABLE_FINANCE_PERSISTENT_EVENTS` is **unset (or not `'true'`)** in the staging backend Doppler config (`stg_stg`) at apply time and remains so. This is the hard split-brain-prevention constraint from `phase-3-staging-activation-plan.md` §7. The `createFinanceV2Routes` boot-time guard at `backend/routes/finance.v2.js:48` will throw if this flag is true; that is the structural enforcement.
- [ ] No finance worker app (`finance-projection-worker`, `finance-audit-worker`, `finance-adapter-worker`) exists in the staging Coolify yet — worker app creation is Phase 3-4.
- [ ] Production Doppler config (`prd_prd`) is not opened, not read, not modified by any 3-2 step.

### 5.4 Database-state checks (staging Supabase)

Run as `service_role` against the staging Supabase project. Read-only — no mutation.

- [ ] `select count(*) from pg_namespace where nspname = 'finance'` — record whether the schema already exists. If it does, migrations 168-171 are still safe to re-apply (every statement is idempotent — see §2 idempotency rows), but the operator records the pre-state for the post-apply diff.
- [ ] `select table_name from information_schema.tables where table_schema = 'finance' order by table_name` — record current table set. Expected pre-state for a fresh staging: empty. Expected post-apply: 9 tables (8 from 168 + `projection_state` from 170).
- [ ] `select policyname, tablename from pg_policies where schemaname = 'finance' order by tablename, policyname` — record current policy set. Expected pre-state: empty (no 171 yet). Expected post-apply: 35 rows.
- [ ] `select tgname, tgrelid::regclass from pg_trigger where tgname like '%finance%' or tgrelid::regclass::text like 'finance.%' order by tgrelid::regclass, tgname` — record current triggers. Expected post-apply: at minimum the 3 audit-events immutability triggers from 169, the projection_state updated_at trigger from 170, and 5 no-hard-delete triggers from 171.
- [ ] `select extname from pg_extension where extname = 'pgcrypto'` — confirm `gen_random_uuid()` is available (used as default in every PK in 168). If absent, application fails on table creation.

### 5.5 Backup checks (per §6 rollback posture)

- [ ] A point-in-time recovery (PITR) snapshot of the staging Supabase project exists from before the apply window. On Supabase, PITR is the supported rollback mechanism; per-table snapshots are not required because the migrations are additive (rollback is `drop`-based, not `restore`-based — see §6.1).
- [ ] The operator has noted the snapshot timestamp in the deploy ticket / Phase 3 evidence pack for 3-13.

---

## 6. Rollback / restore posture

### 6.1 Rollback by `drop` (preferred — non-destructive)

The four migrations are additive only. **None mutates data; none touches `public.*`.** Rollback is to drop the objects each migration created, in reverse order:

| Step | Action                                                                                                                                                                                                                                                                                     | Rolls back    |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------- |
| 1    | Drop the 5 no-hard-delete triggers (171); drop the 2 functions `finance.prevent_hard_delete` / `finance.prevent_hard_delete_posted`; drop the 35 RLS policies; `alter table … disable row level security` on each of the 9 finance tables.                                                 | Migration 171 |
| 2    | Drop the `trg_projection_state_set_updated_at` trigger and the `finance.set_projection_state_updated_at` function; drop the `finance_projection_state_cursor_pair_chk` constraint; drop the `idx_finance_projection_state_tenant_status` index; drop the `finance.projection_state` table. | Migration 170 |
| 3    | Drop the 3 audit-events immutability triggers (`trg_audit_events_no_update`, `trg_audit_events_no_delete`, `trg_audit_events_no_truncate`); drop the `finance.audit_events_immutable` function; drop the `idx_finance_audit_events_replay` index.                                          | Migration 169 |
| 4    | Drop the 8 `finance.*` tables (and their indexes by cascade); drop the `finance.validate_journal_entry_balance` function; drop the `finance` schema.                                                                                                                                       | Migration 168 |

For a partial rollback (e.g., 171 misbehaves but 168-170 are kept), execute only step 1.

**Data implication:** with empty finance tables (the expected state at first application — the controlled tenant has not yet had `financeOps` enabled in 3-5 and the route surface is not yet mounted in 3-7), `drop`-based rollback loses no real data. The dropped objects can be re-created by re-running the migrations in order.

### 6.2 Rollback by PITR (last resort — destructive to subsequent changes)

If `drop`-based rollback fails or the schema state has become inconsistent, the operator restores the staging Supabase project from the PITR snapshot recorded in §5.5. This also rolls back any **unrelated** staging changes between the snapshot and the restore — coordinate with the deploy ticket before invoking.

### 6.3 What is **not** required for rollback

- **No code revert.** Migrations 168-171 are dev-only drafts whose application state is independent of the backend code. The backend's behavior remains gated by `ENABLE_FINANCE_OPS` (unset until 3-7) and `ENABLE_FINANCE_PERSISTENT_EVENTS` (must stay false through Slice 1; structurally enforced by the route-mount guard in `backend/routes/finance.v2.js:48`).
- **No production rollback.** Production is not touched (§4).
- **No tenant communication.** The controlled staging tenant (`a11dfb63-4b18-4eb8-872e-747af2e37c46`) has no Finance Ops access until 3-5, regardless of migration state.

---

## 7. Hard constraints (explicit restatement)

These constraints are non-negotiable for Phase 3-2 and the rest of the Phase 3 arc. Each maps to a hard rule in [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md):

| Constraint                                                                                                                                                                                                                                                                                                           | Source          | Status this task                       |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | -------------------------------------- |
| **No migration applied by this task.**                                                                                                                                                                                                                                                                               | Phase 3-2 scope | Confirmed — this is a doc-only review. |
| **Production is out of scope.** No production Supabase project, no `prd_prd` Doppler config, no Hetzner backend env change, no production tenant.                                                                                                                                                                    | Phase 3-1 §8    | Confirmed.                             |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false`** (unset). The `createFinanceV2Routes` boot-time guard at `backend/routes/finance.v2.js:48` enforces this structurally — any attempt to set it true causes backend startup to throw. Lifting this guard is gated on projection-backed reads landing in Slice 2. | Phase 3-1 §7    | Confirmed.                             |
| **`ENABLE_FINANCE_OPS` remains unchanged.** Setting it `true` is Phase 3-7, not 3-2.                                                                                                                                                                                                                                 | Phase 3-1 §7    | Confirmed.                             |
| **No provider writes.** No adapter execution, no QuickBooks/Xero/ERPNext calls; not in Phase 3-2 scope at all (3-9/3-10 territory).                                                                                                                                                                                  | Phase 3-1 §9    | Confirmed.                             |
| **No DB connection** required by this task. No `psql`, no Supabase MCP `apply_migration`, no `doppler run node`.                                                                                                                                                                                                     | 3-2 acceptance  | Confirmed.                             |
| **No SQL execution** by this task. The migrations remain dev-only drafts on disk.                                                                                                                                                                                                                                    | 3-2 acceptance  | Confirmed.                             |
| **No staging or prod mutation** by this task.                                                                                                                                                                                                                                                                        | 3-2 acceptance  | Confirmed.                             |
| **No provider-write path** opened by this task.                                                                                                                                                                                                                                                                      | 3-2 acceptance  | Confirmed.                             |

---

## 8. Acceptance for Phase 3-2 (this task)

- [x] Migrations 168, 169, 170, 171 inventoried against actual file contents (§2)
- [x] Migration 171 naming / scope mismatch with prior docs flagged and superseded (§2.5)
- [x] Each migration confirmed as staging-only / dev-draft per its header (§2)
- [x] Application order documented (§3)
- [x] Application target restricted to staging Supabase (§4)
- [x] Preflight checks listed (§5)
- [x] Rollback / restore posture documented (§6)
- [x] Hard constraints restated explicitly (§7)
- [x] No migration applied by this task
- [x] Production excluded explicitly
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` remains false
- [x] `ENABLE_FINANCE_OPS` unchanged
- [x] CHANGELOG entry recording Phase 3-2 (separate change)

This document is the Phase 3-2 deliverable when paired with the matching CHANGELOG entry and the scaffold update. **No environment variable was changed, no migration was applied, nothing was deployed.**

Next packet: **Phase 3-3 — Verify RLS, service-role behavior, and finance schema isolation in staging.** That packet runs the in-staging checks listed in §5.2 against the migrations applied by a separate operator action between this doc and 3-3.
