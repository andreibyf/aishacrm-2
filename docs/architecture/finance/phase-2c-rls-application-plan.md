# Finance Ops — Phase 2C-1: Final Staging RLS Validation / Application Plan

**Phase 2C-1 — Staging-Readiness Gate.**
**Track F — AiSHA Finance Ops Architecture.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Application plan — finalized. No staging/production migration applied. RLS migration remains DRAFT until the gate in Section 7 clears.
**Date:** 2026-05-22
**Supersedes the open items in:** [`staging-rls-validation.md`](./staging-rls-validation.md) §4 · [`security-rls-hardening.md`](./security-rls-hardening.md) §1–§2 (this document records the _final decision_; those documents remain authoritative for the policy SQL itself).

---

## 1. Purpose and Scope

Phase 2C is the staging-readiness gate for the completed Finance Ops runtime. It
introduces **no new finance-domain semantics**. This document (2C-1) finalizes
the exact Row-Level Security (RLS) posture for the `finance` schema **before any
staging migration is applied**.

It answers four questions definitively:

1. How does the platform express the current tenant, and is that expression
   available for an RLS predicate?
2. What is the final RLS tenant expression for finance tables?
3. Which finance tables require RLS, and in what form, _immediately_?
4. Which tables remain backend-only and are not exposed through PostgREST?

In scope: the decision and the application plan. **Out of scope:** running any
SQL against staging or production, finalizing the RLS migration out of DRAFT,
and enabling `ENABLE_FINANCE_OPS`.

### Hard constraints in force

- Migrations 172, 173, and the companion RLS migration are **dev/local-only**
  until this gate clears.
- No finance schema exposure through PostgREST is introduced (see
  [`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md)).
- `ENABLE_FINANCE_OPS` stays disabled by default.
- The Track A event vocabulary (`aggregate_type` / `aggregate_id`) and approval
  vocabulary (`target_type` / `target_id`) are preserved.

---

## 2. Tenant Claim Strategy — Explicit Statement

This section makes the tenant claim strategy explicit, as required by the 2C-1
acceptance criteria.

### 2.1 How the backend resolves the tenant

The AiSHA backend does **not** rely on a database-enforced tenant claim for its
own access path. Tenant identity is resolved in the Express middleware chain:

| Stage                  | Mechanism                                                                                                                                                       | Location                                         |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1. Authenticate        | JWT verified (Supabase ES256/HS256, or internal HS256 cookie). Email/`sub` extracted.                                                                           | `backend/middleware/authenticate.js`             |
| 2. Resolve tenant      | `users` table looked up by email; `tenant_id` read from the matched row. `req.user.tenant_id = userPerms.tenant_id ?? payload.tenant_id ?? null`.               | `backend/middleware/authenticate.js` (~line 178) |
| 3. Enforce tenant      | `validateTenantAccess` confirms the request's tenant matches the user's assigned tenant. Applied to every finance route via `router.use(validateTenantAccess)`. | `backend/middleware/validateTenant.js`           |
| 4. Inject into service | `resolveTenantId` / `req.financeTenantId` carries the verified UUID into every domain-service call.                                                             | `backend/routes/finance.v2.js`                   |

**The tenant is therefore an application-layer construct**, resolved per request
and enforced before the finance router runs. It is not, in the backend's own
access path, a database claim.

### 2.2 The database connection role

The backend connects to Postgres with the **Supabase service-role key**
(`SUPABASE_SERVICE_ROLE_KEY`, via `backend/lib/supabaseFactory.js`). The service
role **bypasses RLS entirely**. Every finance read and write the backend
performs is unrestricted at the database layer; tenant isolation on that path is
enforced exclusively by the middleware in Section 2.1.

### 2.3 Is a tenant claim available for an RLS predicate?

Yes — for the _other_ access path (a direct `authenticated` PostgREST call).
The CRM platform's RLS policies are JWT-claim-based; they extract the tenant
from:

```sql
(auth.jwt() ->> 'tenant_id')::uuid
```

This JWT tenant-claim extraction is in production use on CRM tables, though the
exact policy form varies between migrations:

- `backend/migrations/120_fix_remaining_security_issues.sql` — `public.tasks`
  policies use `auth.jwt() ->> 'tenant_id'` (and `auth.jwt() ->> 'role' =
'service_role'` as the bypass clause). The migration header states: _"RLS
  Implementation: Uses JWT claim-based policies (`auth.jwt() ->> 'tenant_id'`).
  No GUC management required — tenant_id extracted from Supabase auth token."_
- `backend/migrations/131_optimize_rls_leads_performance.sql` — creates the
  `public.current_tenant_id()` STABLE SECURITY DEFINER helper
  (`SELECT (auth.jwt() ->> 'tenant_id')::uuid`) and the `public.leads` policies
  read `tenant_id = (SELECT public.current_tenant_id())`.

**Caveat (carried forward as a verification item, not a blocker):** because the
backend uses the service role, the `authenticated`-role predicate is rarely (if
ever) exercised in production today — the frontend reaches data through the
backend API, not direct PostgREST. Whether a live `authenticated` Supabase
session actually carries `tenant_id` in its JWT is therefore
**environment-dependent and must be confirmed in staging** before the finance
`authenticated` policies leave DRAFT. See
[`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md)
§5 and `staging-rls-validation.md` §4.

---

## 3. Final RLS Tenant Expression for Finance Tables

**Decision:** the finance RLS tenant predicate is a **normalized, consolidated
expression derived from the CRM's existing RLS patterns** — not a verbatim copy
of any single CRM policy. The CRM does not use one uniform policy form:
migration 120 inlines the claim and writes the bypass as
`auth.jwt() ->> 'role' = 'service_role'`, while migration 131 wraps the claim in
the `public.current_tenant_id()` helper. The finance predicate consolidates
those patterns into the single form already drafted in
`security-rls-hardening.md` §2, and is hereby finalized:

```sql
-- tenant_match (SELECT / read predicate)
tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
OR (SELECT auth.role()) = 'service_role'

-- service_only (write / INSERT-UPDATE predicate)
(SELECT auth.role()) = 'service_role'
```

Notes:

- `finance.*` tables carry `tenant_id uuid` (not a text slug) — identical type to
  the CRM tables that use these RLS patterns. No cast mismatch.
- The `OR (SELECT auth.role()) = 'service_role'` clause is what grants the
  backend its intended unrestricted access. It is mandatory in every `SELECT`
  predicate. The bypass is written here as `(SELECT auth.role()) = 'service_role'`
  — the standard Supabase idiom — which is functionally equivalent to migration
  120's `auth.jwt() ->> 'role' = 'service_role'`; the normalized form is chosen
  for consistency across the finance policy set.
- **Optional performance variant:** finance policies _may_ adopt the
  `public.current_tenant_id()` helper from migration 131 instead of inlining
  `auth.jwt()`. This is a non-semantic optimization (caches JWT parsing). It is
  not required for 2C and is left to the RLS migration author's discretion;
  whichever form is chosen, the _meaning_ is the finalized expression above.

The full per-table policy SQL is already authored in
`security-rls-hardening.md` §2 and is **not duplicated here**. This document
finalizes the _decision_; that document remains the source of the SQL.

---

## 4. Tables Requiring RLS

All eight finance tables created by migration 172 require RLS. There is no
finance table that is exempt.

| Table                     | RLS required | SELECT         | INSERT / UPDATE              | DELETE | Immediate posture |
| ------------------------- | ------------ | -------------- | ---------------------------- | ------ | ----------------- |
| `finance.accounts`        | Yes          | `tenant_match` | `service_only`               | DENY   | RLS-enabled       |
| `finance.journal_entries` | Yes          | `tenant_match` | `service_only`               | DENY   | RLS-enabled       |
| `finance.journal_lines`   | Yes          | `tenant_match` | `service_only` (UPDATE DENY) | DENY   | RLS-enabled       |
| `finance.invoices`        | Yes          | `tenant_match` | `service_only`               | DENY   | RLS-enabled       |
| `finance.invoice_lines`   | Yes          | `tenant_match` | `service_only`               | DENY   | RLS-enabled       |
| `finance.approvals`       | Yes          | `tenant_match` | `service_only`               | DENY   | RLS-enabled       |
| `finance.audit_events`    | Yes          | `tenant_match` | `service_only` (UPDATE DENY) | DENY   | RLS-enabled       |
| `finance.adapter_jobs`    | Yes          | `tenant_match` | `service_only`               | DENY   | RLS-enabled       |

This matrix matches `security-rls-hardening.md` §2 exactly.

### 4.1 What "RLS immediately" means here

Because finance is backend-mediated only (Section 5) and the backend uses the
service role:

- **`ALTER TABLE ... ENABLE ROW LEVEL SECURITY` on all eight tables is required
  and safe to apply immediately** (within the gated staging migration). With RLS
  enabled, any non-`service_role` connection (`anon`, `authenticated`) is
  **denied by default** — there is no posture where finance data leaks to a
  direct client before the `authenticated` policies are written.
- The **`service_only` INSERT/UPDATE and `DENY` DELETE policies** can likewise
  be finalized immediately — they depend only on `auth.role()`, not on the JWT
  tenant claim, and `auth.role()` behavior is verified in 2C-3.
- The **`tenant_match` SELECT policies for the `authenticated` role** are the
  _only_ part that depends on the unverified JWT `tenant_id` claim. They remain
  **DRAFT** until the staging JWT-claim check (2C-3 §5) passes. Their absence is
  safe: with RLS enabled and no `authenticated` SELECT policy, an `authenticated`
  client sees **zero rows** — fail-closed, not fail-open.

**Conclusion:** "tables requiring RLS immediately" = all eight, with RLS enabled
and the `service_role` policies finalized. The `authenticated` `tenant_match`
SELECT policies are deferred pending the staging JWT-claim verification — and
deferring them is the _more_ conservative posture.

---

## 5. Backend-Only Tables / No PostgREST Exposure

**All eight finance tables remain backend-only.** None is exposed through
PostgREST.

- `supabase/config.toml` sets `schemas = ["public", "graphql_public"]`. The
  `finance` schema is **absent** — PostgREST will not generate REST endpoints
  for any `finance.*` table.
- Verification of this exclusion is the subject of
  [`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md)
  (Phase 2C-2). The stop condition there — _stop if `finance` appears in public
  exposed schemas_ — is currently **PASS**.
- The backend is the only write path. Every finance mutation flows through the
  domain service so that governance evaluation, session-derived actor identity,
  and `finance.audit_events` emission cannot be bypassed.

No public-schema exposure is introduced by this plan. Any future read-only
exposure must follow the controlled view procedure in
`security-rls-hardening.md` §7 and is explicitly out of scope for Phase 2C.

---

## 6. Service-Role Behavior

Documented in full in
[`service-role-tenant-claim-verification.md`](./service-role-tenant-claim-verification.md)
(Phase 2C-3). Summary for this plan:

- The backend's database connection authenticates as `service_role` and bypasses
  RLS. `select auth.role()` from that connection is **expected** to return
  `service_role`; this must be confirmed in staging before the RLS migration is
  applied (2C-3 §3).
- RLS is therefore **a defense-in-depth layer, not the primary tenant control**
  for the backend access path. The primary control is the middleware in
  Section 2.1. RLS exists to fail-close the _direct PostgREST_ path and to give
  a second barrier if the schema is ever exposed.
- The append-only guarantee for `finance.audit_events` does **not** depend on
  RLS — migration 173's `BEFORE` triggers block `UPDATE`/`DELETE`/`TRUNCATE`
  even for `service_role`.

---

## 7. Application Plan and Gate

### 7.1 Migration sequencing

Finance RLS is **not** part of migration 172 or 173 (both leave RLS disabled by
design — 172 lines 184–192 are commented placeholders; 173 states RLS is
finalized separately). The application order is:

1. **Migration 172** — `finance` schema + 8 tables (RLS placeholders only).
2. **Migration 173** — `finance.audit_events` append-only triggers + replay
   index.
3. **Companion RLS migration (new, DRAFT)** — `ENABLE ROW LEVEL SECURITY` on all
   8 tables; `service_role` policies finalized; `authenticated` `tenant_match`
   SELECT policies included **only after** the 2C-3 staging JWT-claim check
   passes; no-hard-delete ledger triggers from `security-rls-hardening.md` §3–§4.
4. Resolve the migration-172 schema blockers in `security-rls-hardening.md` §6
   (`entry_number` generation — Appendix A/F1; `journal_lines` indexing;
   `finance.accounts` vs `public.accounts` qualification; `adapter_jobs` FK
   posture).

All four are **staging-only and gated**. Production application is a separate,
later decision (see [`production-readiness-review.md`](./production-readiness-review.md)).

### 7.2 The gate — must all be true before any staging application

- [ ] PostgREST exclusion confirmed against staging (2C-2).
- [ ] `select auth.role()` from the backend connection returns `service_role`
      in staging (2C-3 §3).
- [ ] Scratch-table RLS-bypass rehearsal passes in staging (2C-3 §4).
- [ ] JWT `tenant_id` claim path confirmed against a staging `authenticated`
      session — or the `authenticated` SELECT policies are kept DRAFT and only
      the `service_role` policies are applied (2C-3 §5).
- [ ] Migration-172 schema blockers (`security-rls-hardening.md` §6) resolved or
      explicitly accepted.
- [ ] No-hard-delete ledger triggers reviewed, packaged, and tested on dev
      Postgres against both `authenticated` and `service_role` connections.
- [ ] `git fetch` shows no divergence on `feat/finance-ops-runtime`
      (`docs/contributing/PARALLEL_AGENTS.md`).
- [ ] `docker exec aishacrm-backend npm test` runs clean.
- [ ] `CHANGELOG.md` updated.

Until every box is checked, the staging gate is **closed** and the finance
schema stays dev/local-only with `ENABLE_FINANCE_OPS` disabled.

---

## 8. Acceptance Criteria — Self-Check

| 2C-1 acceptance criterion                           | Status                                                                                                                                                 |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tenant claim strategy is explicit                   | ✅ Section 2 — application-layer resolution + service-role connection, stated explicitly.                                                              |
| RLS expression is documented                        | ✅ Section 3 — finalized as a normalized, consolidated `auth.jwt() ->> 'tenant_id'` predicate derived from the CRM RLS patterns in migrations 120/131. |
| Service-role behavior is documented                 | ✅ Section 6 + cross-reference to 2C-3.                                                                                                                |
| No staging/prod migration is applied without review | ✅ Section 7 — all four migrations gated; gate closed.                                                                                                 |
| No public schema exposure is introduced             | ✅ Section 5 — all 8 tables backend-only; `finance` absent from `config.toml` schemas.                                                                 |

---

_Part of the Finance Ops architecture suite. Related: `staging-rls-validation.md`
(Phase 2B-14), `security-rls-hardening.md` (Track F),
`postgrest-isolation-verification.md` (2C-2),
`service-role-tenant-claim-verification.md` (2C-3)._
