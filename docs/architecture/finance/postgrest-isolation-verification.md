# Finance Ops — Phase 2C-2: Finance Schema PostgREST Isolation Verification

**Phase 2C-2 — Staging-Readiness Gate.**
**Track F — AiSHA Finance Ops Architecture.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Verification — PASS in repository configuration. Re-verify against staging before migration application.
**Date:** 2026-05-22
**Related:** [`security-rls-hardening.md`](./security-rls-hardening.md) §7 · [`staging-rls-validation.md`](./staging-rls-validation.md) §2 · [`phase-2c-rls-application-plan.md`](./phase-2c-rls-application-plan.md) §5

---

## 1. Goal

Confirm the `finance` schema is **not** exposed through Supabase/PostgREST by
default, so that no `finance.*` table is reachable as a REST endpoint by any
client holding a valid JWT. Finance Ops must remain backend-mediated.

This is a verification document. It introduces no schema change and no new
finance semantics.

---

## 2. Why This Matters

If the `finance` schema were added to PostgREST's exposed-schemas list, any
authenticated client could issue direct REST calls against finance tables —
bypassing every application-layer control:

1. **Governance evaluation** (`financeGovernanceDecision.js`) — no
   `GovernanceDecision` recorded; risk level and policy trace lost.
2. **Session-derived actor identity** (`buildActor` in `finance.v2.js`) — actor
   type not verified against the session; an AI agent could pose as `human`.
3. **Audit emission** — no `finance.audit_events` row written for the operation;
   the immutable trail develops a hole.
4. **AI-blocked commands** — an AI actor could `INSERT` a journal entry directly,
   bypassing `AI_BLOCKED_COMMANDS`.

RLS alone does not close this gap: the backend uses the `service_role` key and
the immediate posture (per `phase-2c-rls-application-plan.md` §4) finalizes only
`service_role` write policies. Schema non-exposure is the primary barrier;
RLS is the second.

---

## 3. Verification

### 3.1 Repository configuration (verified — PASS)

`supabase/config.toml`:

```toml
[api]
enabled = true
port = 54321
# Schemas to expose in your API. Tables, views and stored procedures in this
# schema will get API endpoints. `public` and `graphql_public` schemas are
# included by default.
schemas = ["public", "graphql_public"]
extra_search_path = ["public", "extensions"]
```

- `schemas = ["public", "graphql_public"]` — **`finance` is absent.** PostgREST
  will not generate REST endpoints for any `finance.*` table.
- `extra_search_path = ["public", "extensions"]` — `finance` is **not** on the
  request search path either, so an unqualified table reference in a PostgREST
  request cannot resolve to a finance table.

**Result: PASS.** `finance` is not exposed in the repository's Supabase
configuration.

> Note: `config.toml` is the Supabase CLI / local-stack source of truth. A
> hosted Supabase project also carries an **API → Exposed schemas** setting in
> the dashboard that is independent of this file. Section 3.2 covers re-verifying
> the hosted staging project.

### 3.2 Runtime verification against the staging project

Before migration 172 is applied to staging, and again after, run these checks
against the **staging** Supabase project.

**(a) Confirm the exposed-schemas setting (SQL editor):**

```sql
-- The schemas PostgREST exposes over the REST API.
select current_setting('pgrst.db_schemas');
```

Expected: `public, graphql_public` (project default). The value **must not
contain `finance`**.

**(b) Confirm via the dashboard:**

Supabase Dashboard → **Project Settings → API → Exposed schemas**. The list must
not contain `finance`.

**(c) Confirm a direct REST call to a finance table fails (after 172 is
applied to staging):**

```bash
# Replace <project-ref> and <anon-key>.
# Expected: HTTP 404 (PGRST106 — schema not in exposed schemas). NOT a 200.
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" \
  "https://<project-ref>.supabase.co/rest/v1/journal_entries?select=id"
```

Expected: `404`. Repeat for at least `journal_entries`, `audit_events`, and
`approvals`. A `200` with rows is a **blocking failure**.

**(d) Record the outcome.** Capture the `current_setting` output and the curl
status codes (a screenshot of the dashboard exposed-schemas list is an
acceptable evidence artifact). File the evidence with the staging activation
review ([`staging-activation-review.md`](./staging-activation-review.md)).

---

## 4. Allowed Future Pattern for Read-Only Exposure

Finance is backend-mediated in v1. If a future requirement genuinely needs
direct client read access (e.g. a reporting dashboard using the Supabase client),
exposure must follow this controlled pattern — **never** by adding the raw
`finance` schema:

1. Create a dedicated **read-only view** (in a schema that is, or will be, on the
   exposed list — e.g. a `finance_readonly` schema or a curated `public`-schema
   view) that selects only the columns intended for client consumption.
2. The view is `SECURITY INVOKER` so it respects the caller's RLS.
3. The underlying `finance.*` tables stay unexposed; only the view is reachable.
4. Every `SELECT` RLS policy backing the view is confirmed present and correct
   (`tenant_match`).
5. **No write path is exposed** — INSERT/UPDATE/DELETE remain `service_only`;
   PostgREST writes against the view are blocked by the write policies.
6. After adding the schema to the exposed list, run `NOTIFY pgrst, 'reload
schema'`.
7. The decision is documented in `security-rls-hardening.md` §7 and reviewed.

This is **explicitly out of scope for Phase 2C.** No view, no exposure, no
schema-list change is made in this phase.

---

## 5. Backend Remains the Only Write Path

All finance writes flow through `backend/routes/finance.v2.js` → the finance
domain service. There is no direct Supabase-client write path for finance tables,
and there will not be one while finance is unexposed. The backend's
`service_role` connection is the sole writer; that connection is itself gated by
`ENABLE_FINANCE_OPS`, the `financeOps` module gate, and `validateTenantAccess`.

---

## 6. Acceptance Criteria — Self-Check

| 2C-2 acceptance criterion                                | Status                                                                                                             |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `finance` schema is not exposed through PostgREST        | ✅ Section 3.1 — `config.toml` `schemas` list excludes `finance`; PASS in repo. Re-verify staging per Section 3.2. |
| Any future exposure must be via explicit read-only views | ✅ Section 4 — controlled view pattern documented; raw-schema exposure prohibited.                                 |
| Backend remains the only write path                      | ✅ Section 5.                                                                                                      |

## 7. Stop Condition

> **Stop if `finance` appears in public exposed schemas.**

Current status: **`finance` does NOT appear in the exposed schemas.** The stop
condition is **not triggered**. Phase 2C may proceed.

If a future check (Section 3.2) finds `finance` in the staging project's exposed
schemas, **halt** the staging activation, remove `finance` from the list,
`NOTIFY pgrst, 'reload schema'`, and re-verify before continuing.

---

_Part of the Finance Ops architecture suite. Related: `phase-2c-rls-application-plan.md`
(2C-1), `security-rls-hardening.md` §7 (Track F), `staging-rls-validation.md` §2
(Phase 2B-14)._
