# Finance Ops — Phase 3-3: Staging RLS / Service-Role / Finance Schema Isolation Verification Plan

**Phase 3-3 — Controlled Staging Activation, RLS / service-role / schema-isolation verification.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Verification plan. **No live staging query was run by this task.** No DB connection opened, no SQL executed, no staging or production mutation, no environment variable changed. This document specifies the exact checks an authorized operator runs against staging; it does not run them.
**Date:** 2026-05-24
**Related:**
[`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) (3-1, baseline `3c60d9ff`) ·
[`staging-migration-application-log.md`](./staging-migration-application-log.md) (3-2) ·
[`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) (2C-1, policy contract) ·
[`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md) (2C-2, repo-side PASS) ·
[`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) (2C-3, code-path verified) ·
[`staging-rls-validation.md`](./staging-rls-validation.md) (2B-14) ·
[`security-rls-hardening.md`](./security-rls-hardening.md) ·
`backend/migrations/175_finance_rls_policies.sql`

---

## 1. Purpose and scope

This is the **verification plan** for Phase 3-3. It defines, for each of the five 3-3 deliverables, the exact in-staging checks an operator runs to confirm that the RLS, service-role, and finance-schema-isolation posture defined by the Phase 2C verification docs holds in the staging environment.

The 2C-2 / 2C-3 / 2B-14 / 2C-1 documents define **what must be true**. This document defines **how to verify it in staging**, with pass/fail criteria and stop conditions, so that the deploy owner (Dre, per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §4) can execute the verification without ambiguity.

**This document is a plan, not an execution log.** It does not connect to staging, run SQL, or modify any environment. When the checks are executed by the deploy owner, the outputs are captured here (or in a follow-up evidence record) as the Phase 3-3 deliverable for the activation evidence pack (Phase 3-13).

---

## 2. Live-query posture

**Default for this task: no live query was run.**

| What                                                  | Status this task |
| ----------------------------------------------------- | ---------------- |
| SQL executed against staging Supabase                 | None.            |
| Direct REST call (curl) against staging Supabase      | None.            |
| `docker exec` against the staging backend container   | None.            |
| Supabase MCP tool invoked against the staging project | None.            |
| Dashboard click against the staging Supabase project  | None.            |
| Staging environment variable read or written          | None.            |
| Production environment touched in any way             | None.            |

A live execution requires Dre's explicit authorization. When authorized, the procedures in §4 are run **in the order listed** and the outputs are captured per §9.

---

## 3. Prerequisites and check timing

The Phase 3-3 checks split into three timing buckets relative to the Phase 3-2 staging migration application:

| Timing                         | What's true at this point                                                                                           | Checks that can run                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| **Before 3-2 migration apply** | `finance.*` does not exist in staging. PostgREST exposes only `public, graphql_public`. Backend route still gated.  | §4.1.a (config), §4.1.b (dashboard), §4.2 (`auth.role()`), §4.3.b (JWT claim shape)                                          |
| **After 3-2 migration apply**  | `finance.*` exists in staging. RLS enabled on all 9 finance tables per migration 175. Backend route still gated.    | §4.1.c (curl 404), §4.3.a (scratch-table rehearsal), §4.4.a (RLS catalog inspection), §4.5 (no direct public finance access) |
| **After 3-7 route activation** | `ENABLE_FINANCE_OPS=true` in staging backend; `financeOps` module flag on the one controlled tenant; route mounted. | §4.4.b (backend tenant-mismatch spot-check — overlaps with 3-8 smoke tests; cross-reference)                                 |

The Phase 3-3 deliverable does **not** require all checks to run before Phase 3-4. Checks that need 3-7 are explicitly scheduled in §4.4.b and will be cross-referenced from the Phase 3-8 smoke-test results doc (per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3-8) when that doc is created. The pre-migration checks (§4.1.a, §4.1.b, §4.2, §4.3.b) can run immediately upon authorization without any staging schema change; §4.5 requires migrations 172 and 175 applied first and depends on §4.1.c.

---

## 4. Verification checks

Each check below specifies: the contract being verified, the source-of-truth doc, the prerequisite state, the exact procedure, the pass criterion, and the fail criterion (which is a stop trigger).

The deploy owner runs each check, records the verbatim output in §9 (or a linked evidence record), and marks pass/fail/skipped. A fail halts Phase 3 per §5 and §6.

### 4.1 Finance schema PostgREST exclusion

**Contract:** the `finance` schema must not appear in PostgREST's exposed-schemas list. Direct REST calls to `finance.*` tables must return 404 (PGRST106 — schema not in exposed schemas). Repo-side configuration is already verified PASS in [`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md) §3.1; these checks re-verify the **hosted staging project**, whose exposed-schemas list is set independently of `supabase/config.toml`.

**Source of truth:** [`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md) §3.2.

#### 4.1.a Confirm exposed-schemas setting via SQL

| Field          | Value                                                                                                                                                                                                  |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prerequisite   | Connection to staging Supabase SQL editor (any role). Does not require finance migrations applied.                                                                                                     |
| Procedure      | `select current_setting('pgrst.db_schemas');`                                                                                                                                                          |
| Pass criterion | Output is `public, graphql_public` (or a superset that does **not** include `finance`).                                                                                                                |
| Fail criterion | Output contains `finance`. **Stop condition triggered** — halt Phase 3, remove `finance` from the exposed list in the dashboard, run `NOTIFY pgrst, 'reload schema'`, and re-verify before continuing. |
| Live query?    | Yes — read-only `SELECT` against `current_setting`. No mutation.                                                                                                                                       |

#### 4.1.b Confirm exposed-schemas setting via dashboard

| Field          | Value                                                                                               |
| -------------- | --------------------------------------------------------------------------------------------------- |
| Prerequisite   | Supabase dashboard access for the staging project.                                                  |
| Procedure      | Supabase Dashboard → **Project Settings → API → Exposed schemas**. Screenshot the list as evidence. |
| Pass criterion | List does not contain `finance`. Screenshot captured in §9.                                         |
| Fail criterion | List contains `finance`. **Stop condition triggered** — same remediation as §4.1.a.                 |
| Live query?    | No — read-only dashboard inspection.                                                                |

#### 4.1.c Confirm direct REST call to a finance table fails

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                     |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite   | Migration 172 (at minimum) applied to staging per Phase 3-2. Staging project anon key available.                                                                                                                                                                                                                                                                                                          |
| Procedure      | For each of `journal_entries`, `audit_events`, `approvals`: <br>`curl -s -o /dev/null -w "%{http_code}\n" -H "apikey: <anon-key>" -H "Authorization: Bearer <anon-key>" "https://<project-ref>.supabase.co/rest/v1/<table>?select=id"` <br>Replace `<project-ref>` with the staging project ref and `<anon-key>` with the staging anon key (never the service-role key in a curl call; never log either). |
| Pass criterion | Every call returns `404`. Response body, if captured, contains `PGRST106` (schema not in exposed schemas).                                                                                                                                                                                                                                                                                                |
| Fail criterion | Any call returns `200` with rows, `401`, or `403`. `200` is a **blocking failure** (finance is exposed). Other non-404 statuses require investigation but are not immediately blocking — record and escalate.                                                                                                                                                                                             |
| Live query?    | Yes — three read-only REST calls. No data is mutated. The calls use the **anon** key so even if PostgREST returned rows the response would be RLS-filtered (zero rows from `authenticated`/`anon` per migration 175 — so a 200-with-rows here would imply both schema exposure and a missing/broken `authenticated` policy).                                                                              |

### 4.2 `service_role` / `auth.role()` behavior

**Contract:** the backend's Postgres connection authenticates as `service_role`, and `service_role` bypasses RLS on `finance.*` tables. Code-path verified in repo per [`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) §2; this check confirms the assumption holds for the staging connection.

**Source of truth:** [`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) §3.1.

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite   | Staging backend container running on VPS-1 (`staging-backend-heavy` per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §5.2). Backend env wired to staging Supabase via Doppler `stg_stg`. Does not require finance migrations applied; does not require `ENABLE_FINANCE_OPS=true`.                                                                                                                                                                                                                                               |
| Procedure      | Issue the query through the **backend's own pool** (not the dashboard SQL editor, which authenticates as a different role): <br>`ssh andreibyf@147.189.173.237` <br>`docker exec staging-backend-heavy node -e "const { Pool } = require('pg'); const pool = new Pool({ connectionString: process.env.DATABASE_URL }); pool.query('select auth.role() as role, auth.jwt() as jwt').then(r => { console.log(JSON.stringify(r.rows[0])); return pool.end(); }).catch(e => { console.error(e.message); process.exit(1); });"` <br>Capture stdout verbatim into §9. |
| Pass criterion | `role` is `service_role`. `jwt` is empty / null (expected — the `service_role` bypass clause does not read the JWT; harmless and recorded as evidence per 2C-3 §3.2).                                                                                                                                                                                                                                                                                                                                                                                           |
| Fail criterion | `role` is anything other than `service_role` (e.g., `authenticated`, `anon`, `postgres`). **Stop condition triggered** — the RLS policy model does not hold as written. Halt Phase 3 and revise the RLS policies (or the backend connection) before re-applying migration 175.                                                                                                                                                                                                                                                                                  |
| Live query?    | Yes — one read-only query through `docker exec`. No mutation. The DATABASE_URL and any secrets are not echoed.                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

### 4.3 Tenant claim strategy

**Contract:** the backend resolves tenant from the `users` table (application layer), not from a JWT claim — so tenant isolation on the backend's access path is application-enforced. RLS is defense-in-depth. The `authenticated` SELECT policies in migration 175 hard-code `(auth.jwt() ->> 'tenant_id')::uuid`; whether a staging `authenticated` JWT carries that claim at the top level is environment-dependent and must be confirmed before the `authenticated` policies are relied upon for any client-direct path. RLS posture in staging starts with the `authenticated` SELECT policies effectively unused (because PostgREST does not expose `finance`); §4.3.b verifies the claim shape so a future controlled exposure (the read-only view pattern in [`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md) §4) does not silently fail.

**Source of truth:** [`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) §5.3–§5.4, [`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) §2.

#### 4.3.a Scratch-table RLS bypass rehearsal

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite   | Staging SQL editor access (service_role). Does not require finance migrations applied — uses a throwaway `public._finance_rls_rehearsal` table that is created and dropped within this check.                                                                                                                                                                                                                                                         |
| Procedure      | Per [`staging-rls-validation.md`](./staging-rls-validation.md) §3.2: create a throwaway table with `tenant_id uuid`, enable RLS with a `tenant_match` policy mirroring the migration-175 shape, insert rows for two distinct tenant UUIDs, run `select count(*)` from the service_role connection, then from an `authenticated` session carrying a mismatched `tenant_id` claim, then drop the table. Exact SQL per `staging-rls-validation.md` §3.2. |
| Pass criterion | Service_role connection sees both tenants' rows. Authenticated connection with a mismatched `tenant_id` claim sees zero rows. Table dropped cleanly after rehearsal.                                                                                                                                                                                                                                                                                  |
| Fail criterion | Authenticated connection sees foreign-tenant rows (RLS not enforcing). Or service_role connection sees zero rows (bypass not working). **Either is a stop condition** — halt Phase 3, do not apply migration 175 to staging, investigate Supabase project configuration.                                                                                                                                                                              |
| Live query?    | Yes — creates and drops a scratch `public.*` table. No `finance.*` mutation. Use `_finance_rls_rehearsal_<timestamp>` to avoid collision; the table is dropped before the check completes.                                                                                                                                                                                                                                                            |

#### 4.3.b JWT tenant-claim shape

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite   | An `authenticated` session against the staging Supabase project (a logged-in user of the controlled staging tenant — `a11dfb63-4b18-4eb8-872e-747af2e37c46`). Does not require finance migrations applied.                                                                                                                                                                                                                                                                                                           |
| Procedure      | From an `authenticated` session — Supabase Studio "Run as authenticated user" or an authenticated REST call to a `select` RPC: <br>`select auth.jwt() as full_jwt, auth.jwt() ->> 'tenant_id' as top_level_claim, auth.jwt() -> 'app_metadata' ->> 'tenant_id' as app_metadata_claim;`                                                                                                                                                                                                                               |
| Pass criterion | `top_level_claim` returns the tenant UUID as text and casts cleanly via `::uuid`.                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Fail criterion | `top_level_claim` is null and only `app_metadata_claim` is populated. This is **not** a Phase 3 stop condition by itself — the finance `authenticated` SELECT policies are unused while finance stays unexposed through PostgREST (§4.1). Record the finding and keep the `authenticated` policies in DRAFT-equivalent posture: rewrite the RLS predicate to read `(auth.jwt() -> 'app_metadata' ->> 'tenant_id')::uuid` before any future controlled finance-schema exposure. Service_role policies are unaffected. |
| Live query?    | Yes — one read-only `SELECT`. No mutation. `full_jwt` may contain claim values; redact / minimize when capturing evidence (per [`observability-alerting.md`](./observability-alerting.md) finance-specific never-log rule for JWT contents).                                                                                                                                                                                                                                                                         |

### 4.4 Backend tenant enforcement

**Contract:** for the only access path that exists in v1 (the backend route surface), tenant isolation is enforced by the six-control middleware chain in [`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) §4 — not by RLS. The chain is already code-path-verified in repo; the live spot-check confirms it holds at runtime in staging.

**Source of truth:** [`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) §4, [`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) §2.1.

#### 4.4.a RLS catalog inspection (post-migration-175 inventory)

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Prerequisite   | Migrations 172, 173, 174, 175 applied to staging per Phase 3-2.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Procedure      | From the staging SQL editor (service_role): <br>`select relname, relrowsecurity from pg_class where relnamespace = 'finance'::regnamespace and relkind = 'r' order by relname;` — expect 9 rows, all `relrowsecurity = true`. <br>`select policyname, tablename, cmd from pg_policies where schemaname = 'finance' order by tablename, policyname;` — expect 35 rows matching the policy set defined in `backend/migrations/175_finance_rls_policies.sql`. <br>`select tgname, tgrelid::regclass from pg_trigger where tgrelid::regclass::text like 'finance.%' and not tgisinternal order by tgrelid::regclass, tgname;` — expect 9 triggers: 5 no-hard-delete (175) + 3 audit-events immutability (173) + 1 projection_state updated_at (174). |
| Pass criterion | All three queries return the expected counts and shapes. No table reports `relrowsecurity = false`. No expected policy is missing. No expected trigger is missing.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Fail criterion | Any finance table reports `relrowsecurity = false`, or the policy / trigger inventory diverges from the expected counts and shapes. **Stop condition triggered** — investigate before any Phase 3 packet proceeds (likely cause: migration 175 partially applied, or a prior environment carried a non-superseded older policy set).                                                                                                                                                                                                                                                                                                                                                                                                             |
| Live query?    | Yes — three read-only catalog `SELECT`s. No mutation, no finance row touched.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

#### 4.4.b Backend tenant-mismatch spot-check (deferred to Phase 3-7 / 3-8)

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite   | Phase 3-7 complete: `ENABLE_FINANCE_OPS=true` on `staging-backend-heavy`, `financeOps` module flag enabled for the controlled tenant `a11dfb63-4b18-4eb8-872e-747af2e37c46`. The finance route surface is mounted.                                                                                                                                                                                                                                                           |
| Procedure      | This check overlaps with the Phase 3-8 smoke test sequence already defined in [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §3-8. Specifically: issue an authenticated request to `GET /api/v2/finance/runtime/status` with a `tenant_id` in the path/body/header that does **not** match the caller's session tenant. Expected behavior: `400` or `403` from `validateTenantAccess` middleware (per `backend/middleware/validateTenant.js`). |
| Pass criterion | Mismatched tenant request returns `400` or `403`. Matched tenant request returns `200` with the runtime status payload.                                                                                                                                                                                                                                                                                                                                                      |
| Fail criterion | Mismatched tenant request returns `200` (data leak), `404` (gating misconfiguration that bypasses validation), or `500` (unhandled). **Stop condition triggered** per Phase 3 stop-condition list "tenant isolation is uncertain" / "any route bypasses auth, tenant, or module gate".                                                                                                                                                                                       |
| Live query?    | Yes — two authenticated HTTP requests to the staging backend (no DB mutation; runtime/status is a read-only endpoint per [`finance.v2.js`](../../../backend/routes/finance.v2.js)).                                                                                                                                                                                                                                                                                          |

Phase 3-3 records this check as **scheduled, not executed**, since 3-7 is a later packet. The 3-8 smoke-test results document will carry the executed outcome and link back here.

### 4.5 No direct public finance table access

**Contract:** there is no other path to `finance.*` than (a) the backend's `service_role` connection or (b) a direct PostgREST call (which is structurally refused by §4.1). Public read access by `anon` or `authenticated` clients must always fail.

**Source of truth:** [`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md) §5, [`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) §4.

| Field          | Value                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prerequisite   | Migrations 172 and 175 applied to staging (so that `finance.*` exists and RLS is enabled). The §4.1 PostgREST schema exclusion checks have passed.                                                                                                                                                                                                                                                                                                                                                                                      |
| Procedure      | The §4.1.c curl returning 404 is the primary proof: with the `finance` schema unexposed, no client can reach `finance.*` via PostgREST regardless of role. **Additional defense-in-depth check**: from the staging SQL editor authenticated as a non-`service_role` connection (Supabase Studio "Run as authenticated user" with the controlled tenant's session): `select count(*) from finance.journal_entries;` — expect either a permission error or zero rows. Either is acceptable; a non-zero row count is a fail.               |
| Pass criterion | §4.1.c returns 404 for all three tables. The defense-in-depth SELECT either errors with "permission denied" or returns `0`.                                                                                                                                                                                                                                                                                                                                                                                                             |
| Fail criterion | §4.1.c returns 200 with rows (covered as a stop condition in §4.1.c). Or the defense-in-depth SELECT returns a non-zero count (the `authenticated` SELECT policy in migration 175 returns rows for a session whose JWT `tenant_id` claim matches; this would imply both (a) PostgREST is somehow exposing `finance` despite §4.1 returning PASS — investigate — **and** (b) the JWT claim shape works as 4.3.b expects — record as a positive finding for the future controlled-view exposure path, but still **stop** because of (a)). |
| Live query?    | Yes — one read-only `SELECT` (returns zero or error). No mutation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |

---

## 5. Stop conditions

Phase 3-3 stop conditions are the subset of the Phase 3 scaffold stop conditions ([`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §10.3) that apply to RLS / service-role / schema isolation. Any of the following triggers an immediate halt; rollback per §6.

- `finance` schema appears in the staging PostgREST exposed-schemas list (§4.1.a, §4.1.b).
- Any curl call to a `finance.*` REST endpoint returns `200` with rows (§4.1.c).
- The backend's database connection authenticates as a role other than `service_role` (§4.2).
- Scratch-table rehearsal: `authenticated` connection sees foreign-tenant rows (§4.3.a).
- Scratch-table rehearsal: `service_role` connection sees zero rows (§4.3.a).
- `relrowsecurity` is false on any of the 9 finance tables after migration 175 (§4.4.a).
- The migration-175 policy or trigger inventory diverges from the expected shape (§4.4.a).
- A backend tenant-mismatch request returns `200` instead of `400`/`403` (§4.4.b, scheduled).
- A non-`service_role` `SELECT` against `finance.*` returns a non-zero count (§4.5).

A stop condition does **not** require schema rollback for these checks alone: nothing in §4 mutates finance data. Stop = halt Phase 3 progression, document the finding, and remediate before continuing.

---

## 6. Failure response

If any check in §4 fails, the deploy owner:

1. **Halts Phase 3 immediately.** Do not start any subsequent packet (3-4 worker deployment, 3-5 tenant enablement, 3-7 route activation) until the finding is closed.
2. **Records the verbatim output** in §9 evidence pack (or links a separate evidence record). Do not paraphrase failure output.
3. **Notifies the rollback owner** (Dre, per [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md) §4) — for 3-3, the rollback is config-level (PostgREST exposed-schemas list edit, RLS migration revision, or backend connection-role investigation), not a schema rollback. Schema rollback per [`staging-migration-application-log.md`](./staging-migration-application-log.md) §6 is the last-resort option if a check exposes a migration-application defect that can't be remediated in place.
4. **Re-runs the failing check** after remediation. Record the second run as a separate evidence row; do not overwrite the first.
5. **Does not proceed to Phase 3-4 until every Phase 3-3 check is PASS or explicitly DEFERRED with reason** (only §4.4.b is legitimately deferred — until 3-7 lands — and that deferral is recorded in this document at §4.4.b).

---

## 7. Hard constraints (explicit restatement)

These constraints are non-negotiable for Phase 3-3 and the rest of the Phase 3 arc. Each maps to a hard rule in [`phase-3-staging-activation-plan.md`](./phase-3-staging-activation-plan.md):

| Constraint                                                                                                                                                                                                                                                                                                           | Source          | Status this task                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | --------------------------------- |
| **No live staging query was run by this task.** This document is the verification plan, not the execution.                                                                                                                                                                                                           | 3-3 scope       | Confirmed — doc-only.             |
| **No migration applied by this task.** Phase 3-3 verifies the posture established by Phase 3-2's migration application; it does not itself apply migrations.                                                                                                                                                         | 3-2 scope       | Confirmed.                        |
| **Production is out of scope.** No production Supabase project, no `prd_prd` Doppler config, no Hetzner backend env change, no production tenant queried.                                                                                                                                                            | Phase 3-1 §8    | Confirmed.                        |
| **`ENABLE_FINANCE_PERSISTENT_EVENTS` remains `false`** (unset). The `createFinanceV2Routes` boot-time guard at `backend/routes/finance.v2.js:48` enforces this structurally — any attempt to set it true causes backend startup to throw. Lifting this guard is gated on projection-backed reads landing in Slice 2. | Phase 3-1 §7    | Confirmed.                        |
| **`ENABLE_FINANCE_OPS` remains unchanged.** Setting it `true` is Phase 3-7, not 3-3.                                                                                                                                                                                                                                 | Phase 3-1 §7    | Confirmed.                        |
| **No provider writes.** No adapter execution, no QuickBooks/Xero/ERPNext calls; not in Phase 3-3 scope at all (3-9/3-10 territory).                                                                                                                                                                                  | Phase 3-1 §9    | Confirmed.                        |
| **Finance schema must not be exposed through public PostgREST.** §4.1 verifies this and §4.1's stop condition halts Phase 3 if it ever becomes true.                                                                                                                                                                 | Phase 3-1 §10.3 | Confirmed — and verified by §4.1. |
| **Backend-mediated access for Finance Ops remains mandatory.** The middleware chain in [`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md) §4 is the primary tenant control. RLS is defense-in-depth, not a substitute.                                                       | 2C-3 §5         | Confirmed.                        |
| **No env var changed by this task.**                                                                                                                                                                                                                                                                                 | 3-3 acceptance  | Confirmed.                        |
| **No deployment performed by this task.**                                                                                                                                                                                                                                                                            | 3-3 acceptance  | Confirmed.                        |

---

## 8. Acceptance for Phase 3-3 (this task)

This document is the Phase 3-3 deliverable when paired with the matching CHANGELOG entry and the scaffold update. Acceptance for the **plan** (this task):

- [x] Exact checks needed to verify finance schema PostgREST exclusion defined (§4.1, three sub-checks)
- [x] Exact checks needed to verify `auth.role()` / service-role behavior defined (§4.2)
- [x] Exact checks needed to confirm tenant claim strategy defined (§4.3.a scratch-table rehearsal, §4.3.b JWT claim shape)
- [x] Exact checks needed to confirm backend tenant enforcement defined (§4.4.a RLS catalog inspection, §4.4.b backend tenant-mismatch spot-check — the latter scheduled for 3-7/3-8 overlap)
- [x] Exact checks needed to confirm no direct public finance table access defined (§4.5, leveraging §4.1.c)
- [x] Expected pass/fail criteria included for each check
- [x] Stop conditions enumerated (§5)
- [x] Live-query posture explicitly stated: **no live query run** (§2)
- [x] Production excluded explicitly (§7)
- [x] `ENABLE_FINANCE_OPS` unchanged (§7)
- [x] `ENABLE_FINANCE_PERSISTENT_EVENTS` remains false / unset and structurally refused at route mount until Slice 2 (§7)
- [x] Backend-mediated access for Finance Ops preserved as mandatory (§7, cross-ref §4.3 and §4.4)
- [x] No unsafe SQL execution instructions without stop conditions (every §4 procedure has a stop condition in §5)
- [x] CHANGELOG entry recording Phase 3-3 (separate change)

Acceptance for the **execution** (a future, separately-authorized action by the deploy owner): every check in §4 PASS, or §4.4.b explicitly DEFERRED until 3-7. Evidence captured per §9.

---

## 9. Evidence pack (populated on execution)

When the checks are executed, capture verbatim outputs here (or in a linked evidence record under `docs/architecture/finance/phase-3-evidence/`). Until execution, the table below is empty.

| Check  | Run at (UTC) | Operator | Result (PASS / FAIL / DEFERRED) | Output / evidence link | Notes |
| ------ | ------------ | -------- | ------------------------------- | ---------------------- | ----- |
| §4.1.a |              |          |                                 |                        |       |
| §4.1.b |              |          |                                 |                        |       |
| §4.1.c |              |          |                                 |                        |       |
| §4.2   |              |          |                                 |                        |       |
| §4.3.a |              |          |                                 |                        |       |
| §4.3.b |              |          |                                 |                        |       |
| §4.4.a |              |          |                                 |                        |       |
| §4.4.b |              |          | DEFERRED (until Phase 3-7)      | — (see §4.4.b)         |       |
| §4.5   |              |          |                                 |                        |       |

After execution, this document is updated with the populated table and the Phase 3-3 status in the scaffold is advanced from "verification plan committed" to "verification execution complete".

Next packet (once §4 PASS or §4.4.b DEFERRED as scheduled): **Phase 3-4 — Deploy disabled-by-default finance workers to staging.**
