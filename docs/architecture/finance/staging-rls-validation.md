# Finance Ops — Staging-Safe RLS Validation

**Phase 2B-14 — Pre-Staging RLS & Persistence Validation Checklist.**
**Track F — AiSHA Finance Ops Architecture.**
**Branch:** `feat/finance-ops-runtime`
**Status:** Validation checklist — dev-only. No migration applied. RLS policies remain DRAFT.
**Scope:** Pre-staging verification only. Documentation; no migration, no SQL run against any database, no Finance Ops enablement.
**Covers:** `backend/migrations/168_finance_ops_runtime_scaffold.sql` · `backend/migrations/169_finance_event_store_append_only.sql` · `backend/lib/finance/financeEventStore.js` · `backend/lib/finance/financeEventStore.pg.js`

---

## 1. Overview

This document is the **pre-staging validation checklist** for applying the Finance
Ops schema (migrations 168 and 169) and its Row-Level Security (RLS) posture to a
staging environment. It complements — and does not contradict —
[`security-rls-hardening.md`](./security-rls-hardening.md) (Track F), which owns
the RLS policy _design_. This document owns the _verification gate_ that must
clear before that design is applied anywhere beyond dev/local.

Hard constraints in force for the current phase:

- **Migrations 168 and 169 are dev/local-only.** Nothing in this phase is applied
  to staging or production.
- **No provider writes, no OAuth.** Finance adapters remain read/draft-only by
  contract; no external system is touched.
- **`ENABLE_FINANCE_OPS` stays disabled by default.** Enabling Finance Ops is out
  of scope; this document does not change any feature flag.
- **Track A envelope is preserved.** The `aggregate_type` / `aggregate_id` event
  envelope and the approval linkage (`target_type` / `target_id` — represented in
  migration 168's `finance.approvals` as `aggregate_type` / `aggregate_id`) are
  frozen and unchanged by this work.

The remainder of this document enumerates the checks. Each check states the exact
query or step, the expected result, and how to record the outcome. The
[Current status](#7-current-status) section is the authoritative gate.

---

## 2. PostgREST Schema Exposure Check

**Decision (confirmed posture): finance is backend-mediated only. The `finance`
schema is excluded from PostgREST by default and must not appear in Supabase's
exposed-schemas list.**

Finance writes must always flow through the domain service layer so that
governance evaluation, actor-identity derivation, and audit-event emission cannot
be bypassed (see `security-rls-hardening.md` Section 7). If `finance` were added
to the PostgREST exposed-schemas list, any authenticated client with a valid JWT
could issue direct REST calls against finance tables — bypassing
`evaluateFinanceGovernance`, the `buildActor` pattern, and `finance.audit_events`
emission, even with RLS enabled. Therefore: **finance is excluded from PostgREST
in v1.**

### 2.1 Check — confirm `finance` is NOT exposed

Run in the Supabase SQL editor of the target (staging) project:

```sql
-- Confirm the schemas PostgREST exposes over the REST API.
select current_setting('pgrst.db_schemas');
```

**Expected result:** the returned value is `public, graphql_public` (or
equivalent — the project default). It **must not contain `finance`**.

Cross-check in the dashboard: **Supabase Dashboard → Project Settings → API →
Exposed schemas.** The `finance` schema must not appear in that list.

### 2.2 Check — confirm a direct REST call to a finance table fails

After migration 168 is applied to staging (gated — see Section 6), confirm a
direct PostgREST call returns 404 / "schema not exposed":

```bash
# Replace <project-ref> and <anon-key>. Expected: HTTP 404 (PGRST106 / schema
# not in exposed schemas) — NOT a 200 with rows.
curl -s -o /dev/null -w "%{http_code}\n" \
  -H "apikey: <anon-key>" \
  -H "Authorization: Bearer <anon-key>" \
  "https://<project-ref>.supabase.co/rest/v1/journal_entries?select=id"
```

**Expected result:** `404`. A `200` indicates `finance` (or a finance table) is
reachable via PostgREST — a **blocking failure**; do not proceed to RLS.

### 2.3 If finance must be exposed later

If a future requirement needs read access to finance data via the Supabase
client, follow the controlled procedure in `security-rls-hardening.md` Section 7
(add `finance` to exposed schemas, `NOTIFY pgrst, 'reload schema'`, verify all
`SELECT` RLS policies, keep writes `service_only`, document the decision). This is
explicitly **out of scope for the current phase**.

---

## 3. `service_role` Behavior Check

The backend connects to Postgres using the Supabase **service role** key. The RLS
design in `security-rls-hardening.md` Section 2 depends on
`(SELECT auth.role()) = 'service_role'` evaluating to `true` for backend
connections — that clause is what grants the backend its intended unrestricted
access and is half of every `tenant_match` predicate.

This assumption **must be verified in staging before the final RLS policies are
applied.** The RLS-bypass behavior of the backend's connection is environment-
dependent (it depends on how the connection authenticates and which role/JWT it
presents); a dev/local assumption is not a staging guarantee.

### 3.1 Check — confirm the backend connection's role

Issue the following from the backend's own database connection (i.e. through the
same pool/credentials the backend uses, not the SQL editor):

```sql
select auth.role();
```

**Expected result:** `service_role`.

If the backend instead reports `authenticated`, `anon`, or `postgres`, the RLS
policy model in `security-rls-hardening.md` Section 2 does **not** hold as
written — the backend would be subject to (or differently exempt from) the
tenant-scoped policies. In that case the RLS policies must be revised before
they are applied. This is a **blocking** pre-staging check.

### 3.2 Check — confirm RLS-bypass behavior with RLS enabled on a scratch table

Before enabling RLS on the real finance tables, verify the bypass behavior on a
throwaway table in the staging environment (dev/local rehearsal is acceptable as
a first pass, but the staging environment is the authoritative check):

1. Create a scratch table with a `tenant_id uuid` column and one row.
2. `alter table ... enable row level security;` with the canonical
   `tenant_match` policy from `security-rls-hardening.md` Section 1.2.
3. From the backend's service-role connection, `select * from <scratch>` — expect
   **all rows** (bypass confirmed).
4. From an `authenticated`-role connection with a mismatched `tenant_id` claim,
   `select * from <scratch>` — expect **zero rows** (tenant scoping confirmed).
5. Drop the scratch table.

**Expected result:** service-role sees all rows; mismatched-tenant authenticated
sees none. Record the outcome. Only then are the finance RLS policies safe to
finalize from DRAFT.

---

## 4. Tenant Claim Verification

The RLS policies in `security-rls-hardening.md` Section 2 hard-code the tenant
predicate as:

```sql
tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
```

This expression assumes the JWT carries the tenant identifier under the
top-level claim key `tenant_id`. If the platform's JWTs instead place it under
`app_metadata.tenant_id`, a custom claim namespace, or a differently named key,
every finance RLS `SELECT` policy would silently match zero rows for legitimate
users. **The exact claim path must be confirmed before the RLS policies leave
DRAFT.**

### 4.1 Check — inspect the live JWT claim shape

From an `authenticated` session against the target environment, run:

```sql
-- Full decoded JWT for the current session — inspect where tenant_id lives.
select auth.jwt();

-- The exact expression the RLS policies will hard-code. Must return the
-- caller's tenant UUID, not null.
select auth.jwt() ->> 'tenant_id'            as top_level_claim,
       auth.jwt() -> 'app_metadata' ->> 'tenant_id' as app_metadata_claim;
```

**Expected result:** `top_level_claim` returns the tenant UUID as text and casts
cleanly via `::uuid`. If `top_level_claim` is null but `app_metadata_claim` is
populated, the RLS predicate must be rewritten to read
`auth.jwt() -> 'app_metadata' ->> 'tenant_id'` before the policies are
finalized.

### 4.2 Cross-check against the CRM convention

`security-rls-hardening.md` Section 1.2 states the canonical expression is
already in production use on CRM tables (migrations 120, 131). Confirm this by
reading those migrations and `docs/reference/DATABASE_REFERENCE.md` — the finance
predicate must be byte-for-byte identical to the CRM convention. If the CRM
tables use a different claim path than the one hard-coded in the finance RLS
draft, the finance draft is wrong and must be corrected. Any divergence is a
**blocking** finding.

### 4.3 Outcome

Until 4.1 and 4.2 both pass against the staging environment, **all finance RLS
policies remain in DRAFT** in `security-rls-hardening.md` Section 2 and are not
applied.

---

## 5. No-Hard-Delete Posture

Finance is append-only for the records that constitute financial truth. The
no-hard-delete posture is enforced at **independent, defense-in-depth layers** —
a bypass of one layer must not silently succeed. This section enumerates where
the posture lives and what must be reviewed before staging.

### 5.1 Database layer — triggers and grants

- **Migration 169** installs `finance.audit_events_immutable()` and the
  `trg_audit_events_no_update` / `trg_audit_events_no_delete` /
  `trg_audit_events_no_truncate` triggers. These `BEFORE` triggers raise
  `restrict_violation` on any `UPDATE`, `DELETE`, or `TRUNCATE` of
  `finance.audit_events` — and they fire **even for the `service_role`
  connection** the backend uses (which bypasses RLS). This makes the trigger,
  not RLS, the authoritative append-only guard for the event store.
- **`security-rls-hardening.md` Sections 3 and 4** specify the broader
  no-hard-delete trigger set for the remaining ledger tables
  (`finance.prevent_hard_delete` on `journal_entries` / `journal_lines` /
  `audit_events`; `finance.prevent_hard_delete_posted` conditional guard on
  `invoices` / `approvals`). These triggers are **DRAFT** — they are specified
  but not yet in a migration. They must be reviewed and tested before staging
  (see Section 6).
- **RLS `DELETE` policies** in `security-rls-hardening.md` Section 2 use
  `USING (false)` for every immutable finance table — an explicit deny at the
  policy layer for `authenticated` clients. RLS alone is insufficient because
  the service role bypasses it; the triggers above are the backstop.

### 5.2 Application layer — in-memory event store interface

`backend/lib/finance/financeEventStore.js` exposes exactly four methods:
`append`, `query`, `replay`, `getCount`. It exposes **no** `update`, `delete`,
`clear`, `remove`, `truncate`, or `upsert` method. There is no code path in the
in-memory store that mutates or removes a stored event; appended events are
additionally `Object.freeze()`-d so they cannot be mutated in place after append.
This is the application-layer no-hard-delete posture for the in-memory store.

This property is regression-guarded by
`backend/__tests__/lib/finance/financePersistencePolicy.test.js`.

### 5.3 Application layer — Postgres event-store adapter

`backend/lib/finance/financeEventStore.pg.js` is **INSERT/SELECT only by
construction**. Confirmed by reading the adapter:

- `append` issues exactly `INSERT ... RETURNING *` — never `ON CONFLICT`, never
  an upsert, never a pre-insert existence check.
- `query`, `replay`, and `getCount` issue only `SELECT` / `SELECT count(*)`.
- The factory returns exactly `{ append, query, replay, getCount }` — no
  `update`, `delete`, `upsert`, `clear`, or `truncate` method is exposed.
- A duplicate primary key (SQLSTATE `23505`) surfaces as
  `FINANCE_EVENT_STORE_DUPLICATE_EVENT_ID` — the conflict is reported, never
  hidden by a silent retry or merge.

### 5.4 Tables that must never allow a hard delete

The following finance records constitute financial truth or the immutable audit
trail. They must **never** be hard-deleted; corrections are made through reversal
or void workflows, never `DELETE`:

| Table / record class            | Why it is immutable                                              |
| ------------------------------- | ---------------------------------------------------------------- |
| `finance.journal_entries`       | Posted ledger entries are financial truth; reverse, never delete |
| `finance.journal_lines`         | The debit/credit lines of a posted entry                         |
| `finance.audit_events`          | The canonical, append-only finance event stream / audit trail    |
| `finance.invoices` (posted)     | Once past `draft` status (`sent`/`paid`/`approved`/etc.)         |
| `finance.approvals` (completed) | Once in a terminal status (`approved`/`executed`/`rejected`)     |

Draft-status invoices and pending approvals may be legitimately cancelled; the
`finance.prevent_hard_delete_posted` conditional trigger (`security-rls-
hardening.md` Section 3.1) permits a delete only while status is `draft` /
non-terminal. `finance.accounts`, `finance.invoice_lines`, and
`finance.adapter_jobs` are operational records rather than financial truth —
they carry `USING (false)` RLS but are not protected by an unconditional delete
trigger in the current design.

---

## 6. Migration Gating

**Migrations 168 and 169 are dev/local-only. Neither has been applied to staging
or production, and neither will be until every item in the checklist below
clears.** This restates and consolidates `security-rls-hardening.md` Section 6
and `event-store-persistence.md` Section 9 — those documents are authoritative
for the policy/persistence design; this checklist is the staging gate.

The following must all be true before migrations 168 and 169 (and the companion
RLS policy migration) may be applied to staging:

- [ ] **PostgREST exclusion confirmed.** Section 2.1 — `current_setting('pgrst.db_schemas')`
      and the Dashboard exposed-schemas list both confirm `finance` is excluded.
- [ ] **Direct REST call to a finance table returns 404.** Section 2.2 —
      verified after 168 is applied to a dev/staging project.
- [ ] **`service_role` behavior verified.** Section 3 — `select auth.role()`
      from the backend connection returns `service_role`, and the scratch-table
      rehearsal confirms bypass-with-RLS-enabled behaves as designed.
- [ ] **Tenant claim confirmed.** Section 4 — the exact JWT claim path is
      confirmed against the staging environment and matches the CRM convention
      (migrations 120, 131); the RLS predicate is correct as written or has been
      corrected.
- [ ] **RLS policies finalized from DRAFT.** The policy SQL in
      `security-rls-hardening.md` Section 2 is moved out of DRAFT only after the
      three checks above pass, and is packaged as a **separate** migration — RLS
      is intentionally not part of 168 or 169.
- [ ] **No-hard-delete triggers and grants reviewed.** Section 5 — migration
      169's `audit_events` triggers are tested on a dev Postgres
      (`UPDATE`/`DELETE`/`TRUNCATE` raise `restrict_violation`); the broader
      ledger-table triggers from `security-rls-hardening.md` Sections 3–4 are
      reviewed, packaged into a migration, and tested against both
      `authenticated` and `service_role` connections.
- [ ] **Migration-168 schema blockers cleared.** The additional blockers in
      `security-rls-hardening.md` Section 6 ("Additional Blockers Identified from
      Reading Migration 168") — `entry_number` nullable+unique handling,
      `journal_lines` indexing, the `finance.accounts` vs `public.accounts` name
      collision, `adapter_jobs` FK posture — are each resolved or explicitly
      accepted.
- [ ] **Idempotency / safe re-run confirmed.** Both migrations are additive and
      idempotent (`IF NOT EXISTS`, `create or replace`, `drop ... if exists`) and
      touch no `public.*` object — confirmed by reading the migration files.
- [ ] **Parallel-agent coordination.** Per `docs/contributing/PARALLEL_AGENTS.md`,
      `git fetch` shows no divergence on `feat/finance-ops-runtime` since this
      work was branched, before anything is pushed or applied.
- [ ] **Regression tests pass.** `docker exec aishacrm-backend npm test` runs
      clean with 0 failures after the migrations are applied to the dev Docker
      environment.
- [ ] **`CHANGELOG.md` updated** with the migration changes before the work is
      committed.

Until every box above is checked, the staging gate is **closed**.

---

## 7. Current Status

### Verified (dev/local, by code/migration review)

- **PostgREST exclusion is the intended posture** — finance is backend-mediated
  only; the `finance` schema is excluded from PostgREST by default. The decision
  is documented here and in `security-rls-hardening.md` Section 7.
- **In-memory event store enforces the no-hard-delete posture at the application
  layer** — `financeEventStore.js` exposes only `append` / `query` / `replay` /
  `getCount`, appended events are frozen, and there is no mutation/delete method.
  Regression-guarded by `financePersistencePolicy.test.js`.
- **Postgres event-store adapter is INSERT/SELECT only** —
  `financeEventStore.pg.js` issues only `INSERT ... RETURNING *` and `SELECT`,
  exposes no mutation method, and reports duplicate-id conflicts rather than
  upserting.
- **Migration 169 installs the `audit_events` append-only triggers** — UPDATE /
  DELETE / TRUNCATE are blocked at the DB layer, including for `service_role`.
- **Migrations 168 and 169 are additive and dev-only** — they create only
  `finance.*` objects, touch no `public.*` object, and are idempotent.
- **The Track A envelope and approval linkage are preserved** —
  `aggregate_type` / `aggregate_id` and the `finance.approvals` linkage columns
  are unchanged by this work.

### Still open (blocking staging)

- **`service_role` behavior is unverified in staging.** `select auth.role()`
  from the backend connection has not been confirmed against a staging
  environment (Section 3).
- **The JWT tenant claim path is unverified against staging.** The RLS predicate
  `(auth.jwt() ->> 'tenant_id')::uuid` is assumed, not confirmed for the staging
  project (Section 4).
- **RLS policies remain in DRAFT.** The policy SQL in
  `security-rls-hardening.md` Section 2 is not finalized and not packaged as a
  migration.
- **The broader ledger-table no-hard-delete triggers are DRAFT.** Only migration
  169's `audit_events` triggers exist; the `journal_entries` / `journal_lines` /
  `invoices` / `approvals` delete-guard triggers from `security-rls-hardening.md`
  Sections 3–4 are specified but not migrated or tested.
- **Migration-168 schema blockers are open** — `entry_number` nullable+unique
  handling and the other items in `security-rls-hardening.md` Section 6.

### The gate

**Staging application of migrations 168 and 169 is BLOCKED** until the three
environment-dependent checks — PostgREST exclusion, `service_role` behavior, and
the JWT tenant claim path — are verified against the staging environment, the
RLS policies and ledger no-hard-delete triggers are finalized from DRAFT into a
companion migration, and every box in Section 6 is checked. Until then the
finance schema stays dev/local-only and `ENABLE_FINANCE_OPS` stays disabled.

---

_This document is part of the Finance Ops architecture suite. Related: Track A
(Event Store contract, in the scaffold), Track F (Security / RLS / Persistence
Hardening), Phase 2B (Event Store Persistence), Track D (Audit / Evidence
Layer)._
