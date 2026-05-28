# Finance Ops — Phase 2C-3: Service-Role and Tenant-Claim Verification

**Phase 2C-3 — Staging-Readiness Gate.**
**Track F — AiSHA Finance Ops Architecture.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Verification plan — code-path verified in repository. Staging environment checks pending.
**Date:** 2026-05-22
**Related:** [`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) · [`security-rls-hardening.md`](./security-rls-hardening.md) §1, §5 · [`staging-rls-validation.md`](./staging-rls-validation.md) §3–§4

---

## 1. Goal

Verify service-role behavior and tenant-scoping assumptions **before** final RLS
activation, so that RLS is applied with a correct understanding of what it does
and does not enforce — and so that RLS is never mistaken for the primary tenant
control.

This document specifies the verification, records what is already verifiable
from the repository, and lists the staging checks that remain.

---

## 2. Backend Database Connection Role

### 2.1 What the backend connects as (verified from code)

The backend connects to Postgres using the **Supabase service-role key**:

- `backend/lib/supabaseFactory.js` builds the admin/DB clients from
  `process.env.SUPABASE_SERVICE_ROLE_KEY` (`getSupabaseAdmin()`,
  `getSupabaseDB()`), with `auth: { autoRefreshToken: false, persistSession:
false }`.
- The same service-role credential backs the finance domain service's database
  access and the `measuredPgPool` passed into `createFinanceV2Routes(...)`.

The service role is a privileged Postgres role that **bypasses Row-Level
Security**. Consequence: **every finance read and write the backend performs is
unrestricted at the database layer.** RLS predicates are not evaluated for the
backend's own connection.

### 2.2 Service-role bypass — explicit statement

> The backend's `service_role` connection bypasses RLS on `finance.*` tables.
> RLS does **not** scope, filter, or restrict any query the backend issues.
> Tenant isolation on the backend access path is enforced **entirely** by the
> application-layer middleware described in Section 4.

This is intentional and matches every existing CRM table: the canonical CRM RLS
predicate carries an explicit `OR (SELECT auth.role()) = 'service_role'` bypass
clause precisely so the backend is exempt.

---

## 3. Required Check — `auth.role()` Behavior

The RLS policy model in `security-rls-hardening.md` §2 depends on
`(SELECT auth.role()) = 'service_role'` evaluating to `true` for the backend's
connection. That is half of every `tenant_match` predicate and the whole of every
`service_only` predicate. The assumption must be **verified in staging** — it is
environment-dependent (it depends on how the pooled connection authenticates and
which role/JWT it presents).

### 3.1 Check — confirm the backend connection's role

Issue from the backend's own database connection (the same pool/credentials the
backend uses — **not** the Supabase SQL editor, which runs as a different role):

```sql
select auth.role();
```

**Expected:** `service_role`.

A one-off way to run this through the backend's pool, in the staging container:

```bash
docker exec aishacrm-backend node -e "
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  pool.query('select auth.role() as role')
    .then(r => { console.log(r.rows[0]); return pool.end(); })
    .catch(e => { console.error(e); process.exit(1); });
"
```

If the backend reports `authenticated`, `anon`, or `postgres` instead of
`service_role`, the RLS model does **not** hold as written and the RLS policies
must be revised before they are applied. **This is a blocking pre-staging check.**

### 3.2 Check — also confirm the tenant claim from the same connection

While connected as the backend, also run:

```sql
select auth.role()                       as connection_role,
       auth.jwt()                        as jwt,
       auth.jwt() ->> 'tenant_id'        as jwt_tenant_id;
```

For a `service_role` connection, `auth.jwt()` is typically empty/null and
`jwt_tenant_id` is null — that is expected and harmless, because the
`service_role` bypass clause does not read the JWT. Record the output as evidence.

---

## 4. Tenant Isolation Is Enforced at the Backend Layer

Because the backend bypasses RLS, tenant isolation for the real access path is an
**application-layer guarantee**. It is enforced, in order, by:

| Control                   | Mechanism                                                                                                                                           | Location                                         |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Authentication            | JWT verified; user identity established                                                                                                             | `backend/middleware/authenticate.js`             |
| Tenant resolution         | `users` row looked up by email; `req.user.tenant_id` set                                                                                            | `backend/middleware/authenticate.js` (~line 178) |
| Tenant access enforcement | `validateTenantAccess` — request tenant must match the user's assigned tenant; applied to all finance routes via `router.use(validateTenantAccess)` | `backend/middleware/validateTenant.js`           |
| Module + runtime gating   | `ENABLE_FINANCE_OPS` runtime gate; `financeOps` per-tenant module gate                                                                              | `financeRuntimeGate.js`, `financeModuleGate.js`  |
| Tenant injection          | `resolveTenantId` → `req.financeTenantId`; every domain-service call is scoped to that UUID                                                         | `backend/routes/finance.v2.js`                   |
| Actor identity            | `buildActor(req)` derives actor type from the session only — never `req.body`                                                                       | `backend/routes/finance.v2.js`                   |

**Backend tenant enforcement remains mandatory.** It is not optional, not
superseded by RLS, and not weakened by enabling RLS. Every finance domain-service
query must use `req.financeTenantId` and must never pass `req.body.tenant_id`
directly to the database (see `security-rls-hardening.md` §5.3).

---

## 5. RLS Must Not Create False Confidence

This is the central conclusion of Phase 2C-3.

### 5.1 The trap

It would be a mistake to read "RLS is enabled on all finance tables" as "tenant
isolation is enforced by the database." For the backend access path — the only
path that exists in v1 — **it is not.** The backend bypasses RLS. If the
middleware in Section 4 were removed or misconfigured, RLS would **not** catch
the leak, because RLS is not in the loop for a `service_role` connection.

### 5.2 What RLS actually does for finance

RLS on `finance.*` is a **defense-in-depth layer**, valuable for exactly two
things:

1. **Fail-closed on the direct PostgREST path.** With RLS enabled and no
   `authenticated` policy, a direct REST call by an `authenticated` client sees
   zero rows. Combined with schema non-exposure
   ([`postgrest-isolation-verification.md`](./postgrest-isolation-verification.md)),
   this is belt-and-suspenders: even if the schema were accidentally exposed,
   RLS denies by default.
2. **A second barrier if the schema is ever intentionally exposed** via the
   controlled read-only view pattern — at which point the `authenticated`
   `tenant_match` SELECT policy becomes the active tenant control for that path.

RLS is **not** a substitute for the backend middleware, and the backend
middleware is **not** made redundant by RLS.

### 5.3 The JWT tenant-claim caveat

The `authenticated` `tenant_match` SELECT policy hard-codes
`tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)`. This claim-extraction
form is consistent with the CRM's existing RLS patterns (migrations 120, 131 —
see `phase-2c-rls-application-plan.md` §2.3, §3). However:

- The backend resolves tenant from the `users` table, **not** from a JWT claim.
- Whether a live `authenticated` Supabase session JWT actually carries
  `tenant_id` at the top level (vs. `app_metadata.tenant_id`, vs. not at all) is
  **environment-dependent and unverified for the staging project.**
- If the claim is absent or under a different path, the finance `authenticated`
  SELECT policy would silently match **zero rows** for legitimate users — a
  fail-closed outcome (no data leak), but a broken one if finance is ever
  exposed.

**Therefore:** the `authenticated` `tenant_match` SELECT policies stay **DRAFT**
until the staging JWT-claim check below passes. The `service_role` policies — the
only ones the backend needs — do not depend on the JWT and can be finalized once
Section 3 passes.

### 5.4 Check — inspect the live JWT claim shape (staging)

From an `authenticated` session against the **staging** project:

```sql
select auth.jwt()                                       as full_jwt,
       auth.jwt() ->> 'tenant_id'                       as top_level_claim,
       auth.jwt() -> 'app_metadata' ->> 'tenant_id'     as app_metadata_claim;
```

**Expected for the finance `authenticated` policy to be correct as drafted:**
`top_level_claim` returns the tenant UUID as text and casts cleanly via `::uuid`.
If only `app_metadata_claim` is populated, the finance RLS predicate must be
rewritten before the `authenticated` policies leave DRAFT. Cross-check that
finance reads the tenant from the **same JWT claim path** the CRM tables use —
`tenant_id` at the JWT top level (migrations 120, 131).

---

## 6. Staging Verification Steps — Checklist

Run in the staging environment, in order. Record each outcome as evidence for
[`staging-activation-review.md`](./staging-activation-review.md).

- [ ] **`auth.role()` from the backend connection** returns `service_role`
      (§3.1). _Blocking._
- [ ] **`auth.jwt()` from the backend connection** captured (§3.2) — expected
      empty/null for `service_role`; recorded as evidence.
- [ ] **Scratch-table RLS-bypass rehearsal** (`staging-rls-validation.md` §3.2):
      create a throwaway table with `tenant_id uuid`, enable RLS with the
      `tenant_match` policy, confirm the `service_role` connection sees all rows
      and a mismatched-tenant `authenticated` connection sees none, then drop it.
- [ ] **JWT tenant-claim path** confirmed against a staging `authenticated`
      session (§5.4) — `auth.jwt() ->> 'tenant_id'` returns the tenant UUID, OR
      the `authenticated` SELECT policies are kept DRAFT and only `service_role`
      policies are applied.
- [ ] **Backend tenant enforcement spot-check**: with `ENABLE_FINANCE_OPS=true`
      on staging for the controlled tenant, confirm a finance route called with a
      mismatched `tenant_id` returns `400/403` from `validateTenantAccess` — i.e.
      isolation holds at the application layer independently of RLS.

---

## 7. Acceptance Criteria — Self-Check

| 2C-3 acceptance criterion                               | Status                                                                                                                    |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `auth.role()` behavior is known                         | ✅ Section 3 — verification procedure defined; expected `service_role`; staging check listed as blocking.                 |
| Service-role bypass behavior is explicitly documented   | ✅ Section 2.2 — explicit statement: `service_role` bypasses RLS; finance backend access is unrestricted at the DB layer. |
| Backend tenant enforcement remains mandatory            | ✅ Section 4 — the six-control middleware chain documented; declared mandatory and not superseded by RLS.                 |
| RLS is treated as a defense layer, not the only control | ✅ Section 5 — explicit "false confidence" analysis; RLS is defense-in-depth, backend middleware is primary.              |

---

_Part of the Finance Ops architecture suite. Related: `phase-2c-rls-application-plan.md`
(2C-1), `postgrest-isolation-verification.md` (2C-2), `security-rls-hardening.md`
(Track F), `staging-rls-validation.md` (Phase 2B-14)._
