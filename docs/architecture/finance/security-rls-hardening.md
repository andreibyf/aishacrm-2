# Finance Ops: Security, RLS, and Persistence Hardening

**Track F — AiSHA Finance Ops Architecture**
**Status:** Draft — dev-only. RLS policies are ready to apply once the migration readiness checklist in Section 6 is cleared.
**Branch:** `feat/finance-ops-runtime`
**Migration:** `backend/migrations/168_finance_ops_runtime_scaffold.sql`

---

## 1. Tenant Isolation Strategy

### 1.1 Schema Isolation

The finance schema (`finance.*`) is a completely separate PostgreSQL schema from the CRM schema (`public.*`). This isolation means:

- PostgREST will not auto-expose `finance.*` unless `finance` is added to the Supabase `schemas` config (see Section 7).
- The `search_path` for authenticated connections defaults to `public`, so casual queries cannot reach finance tables accidentally.
- Finance tables use `tenant_id uuid` (not text slug) on every table, matching the canonical type established for all new work.

### 1.2 Confirmed RLS Expression for Finance Tables

All tenant IDs across the platform were converted to UUIDs. The canonical RLS expression, established in `backend/migrations/120_fix_remaining_security_issues.sql` and `131_optimize_rls_leads_performance.sql`, is:

```sql
USING (
  tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
  OR (SELECT auth.role()) = 'service_role'
)
```

Finance tables use `tenant_id uuid` — identical to the CRM tables that already use this pattern in production. There is no type mismatch. The `::uuid` cast is correct and established.

This expression is used verbatim in the RLS policies in Section 2. No modifications needed.

### 1.3 Why RLS Is Commented Out in Migration 168

RLS is commented out because migration 168 is dev-only until the full migration readiness checklist (Section 6) is cleared. The expression itself is not the blocker — the remaining blockers are the `entry_number` nullable+unique constraint and the migration sequencing review (see Section 6).

### 1.4 service_role Bypass Confirmation

The backend uses the Supabase service role key for all server-side queries. Confirm `(SELECT auth.role()) = 'service_role'` evaluates correctly for backend connections — if it does, the backend is fully exempt from RLS on finance tables by role, which is the intended design. This is consistent with all existing CRM table RLS policies.

---

## 2. RLS Policy Matrix

All finance tables must have RLS enabled. The canonical policy model is: `service_role` has unrestricted access (used by the backend), `authenticated` role has tenant-scoped access, and deletes are explicitly blocked at the policy layer for immutable tables.

Finance writes flow exclusively through the backend service layer — there is no direct Supabase client write path for finance tables. This means `INSERT`/`UPDATE` policies for `authenticated` can be permissive at the DB layer, but the defense-in-depth is the service layer governance check.

### Notation

- `tenant_match` = `tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid) OR (SELECT auth.role()) = 'service_role'`
- `service_only` = `(SELECT auth.role()) = 'service_role'`
- `DENY` = `USING (false)` — explicit deny, no rows visible, no operation permitted

| Table                     | SELECT         | INSERT         | UPDATE                                             | DELETE |
| ------------------------- | -------------- | -------------- | -------------------------------------------------- | ------ |
| `finance.accounts`        | `tenant_match` | `service_only` | `service_only`                                     | DENY   |
| `finance.journal_entries` | `tenant_match` | `service_only` | `service_only` (status transitions only — see §3)  | DENY   |
| `finance.journal_lines`   | `tenant_match` | `service_only` | DENY                                               | DENY   |
| `finance.invoices`        | `tenant_match` | `service_only` | `service_only` (draft status only — see §3)        | DENY   |
| `finance.invoice_lines`   | `tenant_match` | `service_only` | `service_only`                                     | DENY   |
| `finance.approvals`       | `tenant_match` | `service_only` | `service_only` (non-terminal status only — see §3) | DENY   |
| `finance.audit_events`    | `tenant_match` | `service_only` | DENY                                               | DENY   |
| `finance.adapter_jobs`    | `tenant_match` | `service_only` | `service_only`                                     | DENY   |

**Rationale for `service_only` INSERT/UPDATE:**
Finance writes must always go through the domain service layer, which enforces governance decisions (`financeGovernanceDecision.js`). Direct authenticated client writes would bypass the `evaluateFinanceGovernance` check, actor identity derivation, and audit event emission. The RLS `service_only` constraint enforces this at the database layer.

### Full Policy SQL (apply after Section 6 migration readiness checklist is cleared)

```sql
-- Enable RLS on all finance tables
alter table finance.accounts        enable row level security;
alter table finance.journal_entries enable row level security;
alter table finance.journal_lines   enable row level security;
alter table finance.invoices        enable row level security;
alter table finance.invoice_lines   enable row level security;
alter table finance.approvals       enable row level security;
alter table finance.audit_events    enable row level security;
alter table finance.adapter_jobs    enable row level security;

-- ── finance.accounts ──────────────────────────────────────────────────────────
create policy finance_accounts_select on finance.accounts
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_accounts_insert on finance.accounts
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_accounts_update on finance.accounts
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy finance_accounts_delete on finance.accounts
  for delete using (false);

-- ── finance.journal_entries ────────────────────────────────────────────────────
create policy finance_je_select on finance.journal_entries
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_je_insert on finance.journal_entries
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_je_update on finance.journal_entries
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy finance_je_delete on finance.journal_entries
  for delete using (false);

-- ── finance.journal_lines ─────────────────────────────────────────────────────
create policy finance_jl_select on finance.journal_lines
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_jl_insert on finance.journal_lines
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_jl_update on finance.journal_lines
  for update using (false);

create policy finance_jl_delete on finance.journal_lines
  for delete using (false);

-- ── finance.invoices ──────────────────────────────────────────────────────────
create policy finance_invoices_select on finance.invoices
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_invoices_insert on finance.invoices
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_invoices_update on finance.invoices
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy finance_invoices_delete on finance.invoices
  for delete using (false);

-- ── finance.invoice_lines ─────────────────────────────────────────────────────
create policy finance_invoice_lines_select on finance.invoice_lines
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_invoice_lines_insert on finance.invoice_lines
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_invoice_lines_update on finance.invoice_lines
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy finance_invoice_lines_delete on finance.invoice_lines
  for delete using (false);

-- ── finance.approvals ─────────────────────────────────────────────────────────
create policy finance_approvals_select on finance.approvals
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_approvals_insert on finance.approvals
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_approvals_update on finance.approvals
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy finance_approvals_delete on finance.approvals
  for delete using (false);

-- ── finance.audit_events ─────────────────────────────────────────────────────
create policy finance_audit_events_select on finance.audit_events
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_audit_events_insert on finance.audit_events
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_audit_events_update on finance.audit_events
  for update using (false);

create policy finance_audit_events_delete on finance.audit_events
  for delete using (false);

-- ── finance.adapter_jobs ──────────────────────────────────────────────────────
create policy finance_adapter_jobs_select on finance.adapter_jobs
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

create policy finance_adapter_jobs_insert on finance.adapter_jobs
  for insert with check ((select auth.role()) = 'service_role');

create policy finance_adapter_jobs_update on finance.adapter_jobs
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

create policy finance_adapter_jobs_delete on finance.adapter_jobs
  for delete using (false);
```

---

## 3. No-Hard-Delete Enforcement

No-hard-delete is enforced at three independent layers. A bypass of one layer must not silently succeed.

### 3.1 Database Layer — DELETE Trigger

The RLS `USING (false)` policies in Section 2 block deletes from authenticated clients. However, since the backend uses the `service_role` key, the service role bypasses RLS. A trigger-level guard is required to protect against service role deletes.

The following trigger function raises an exception on any DELETE attempt on immutable finance tables:

```sql
create or replace function finance.prevent_hard_delete()
returns trigger
language plpgsql
security definer
as $$
begin
  raise exception
    'Hard delete is not permitted on finance.% (id: %). Use reversal or void workflows.',
    TG_TABLE_NAME, OLD.id
    using errcode = 'P0001';
  return null;
end;
$$;

-- Apply to journal_entries
create trigger trg_no_delete_journal_entries
  before delete on finance.journal_entries
  for each row execute function finance.prevent_hard_delete();

-- Apply to journal_lines
create trigger trg_no_delete_journal_lines
  before delete on finance.journal_lines
  for each row execute function finance.prevent_hard_delete();

-- Apply to audit_events
create trigger trg_no_delete_audit_events
  before delete on finance.audit_events
  for each row execute function finance.prevent_hard_delete();
```

For invoices and approvals, the trigger applies conditional logic rather than an unconditional block, because draft records may be legitimately cancelled:

```sql
create or replace function finance.prevent_hard_delete_posted()
returns trigger
language plpgsql
security definer
as $$
begin
  if OLD.status not in ('draft') then
    raise exception
      'Hard delete is not permitted on finance.% once status is % (id: %). Use reversal or void.',
      TG_TABLE_NAME, OLD.status, OLD.id
      using errcode = 'P0001';
  end if;
  return old;
end;
$$;

create trigger trg_no_delete_invoices
  before delete on finance.invoices
  for each row execute function finance.prevent_hard_delete_posted();

create trigger trg_no_delete_approvals
  before delete on finance.approvals
  for each row execute function finance.prevent_hard_delete_posted();
```

`finance.accounts`, `finance.invoice_lines`, `finance.adapter_jobs`: these tables do not carry the same immutability requirement as ledger records, but they still have `USING (false)` RLS policies. A service-role delete would succeed at the DB layer — this is acceptable given that accounts and adapter jobs are operational records rather than financial truth. If stricter enforcement is needed, the unconditional `prevent_hard_delete` trigger can be applied to these tables as well.

### 3.2 Application Layer — Service Method Guard

The finance domain service must check record status before allowing any destructive patch. The guard pattern:

```javascript
// Example: guard before any status transition that is terminal
function assertMutable(record, tableName) {
  const IMMUTABLE_STATUSES = ['posted', 'reversed', 'voided', 'approved', 'executed'];
  if (IMMUTABLE_STATUSES.includes(record.status)) {
    const err = new Error(
      `Cannot mutate ${tableName} ${record.id}: status is '${record.status}'. Use reversal or void workflow.`,
    );
    err.statusCode = 409;
    throw err;
  }
}
```

This guard must be called in service methods that accept a PATCH or status transition, before the Supabase client call is made.

### 3.3 API Layer — No DELETE Routes Exposed

Reviewing `backend/routes/finance.v2.js`, there are no `router.delete(...)` registrations. The route file exposes:

- `GET /runtime/status`
- `GET /journal-entries`
- `GET /ledger`
- `GET /profit-loss`
- `GET /balance-sheet`
- `POST /draft-invoices`
- `PATCH /draft-invoices/:id`
- `POST /journal-drafts`
- `POST /simulate/deal-won`
- `POST /journal-entries/:id/reverse`
- `POST /approvals/:id/approve`

No `DELETE` method handlers exist. This must be maintained as a hard constraint: no `router.delete(...)` is ever added to finance routes without explicit architectural review. A code review gate (or lint rule) should enforce this.

---

## 4. Append-Only `audit_events` Guard

`finance.audit_events` must be insert-only in all normal operation. It records the immutable ledger of every governance decision, actor action, and state change. Any UPDATE or DELETE on this table corrupts the audit trail.

### 4.1 Trigger-Level Enforcement

The `USING (false)` RLS policies in Section 2 block UPDATE and DELETE from authenticated clients. For service-role-level protection, a trigger is required:

```sql
create or replace function finance.enforce_audit_events_immutability()
returns trigger
language plpgsql
security definer
as $$
begin
  if TG_OP = 'UPDATE' then
    raise exception
      'audit_events rows are immutable. UPDATE is not permitted (id: %).',
      OLD.id
      using errcode = 'P0002';
  end if;

  if TG_OP = 'DELETE' then
    raise exception
      'audit_events rows cannot be deleted (id: %).',
      OLD.id
      using errcode = 'P0002';
  end if;

  return null;
end;
$$;

create trigger trg_audit_events_immutable
  before update or delete on finance.audit_events
  for each row execute function finance.enforce_audit_events_immutability();
```

This trigger fires before both UPDATE and DELETE, regardless of the caller's role. The trigger function is `security definer` to ensure it cannot be bypassed by privilege escalation.

### 4.2 Enforcement Mechanism

This is enforced via a dedicated trigger, not via RLS alone, because:

- RLS can be bypassed by the `service_role` key (which the backend uses).
- A `BEFORE` trigger fires unconditionally regardless of role, including `service_role` and superuser connections at the application layer.
- PostgreSQL superuser connections (e.g., direct psql access to the Supabase managed instance) can bypass triggers with `ALTER TABLE ... DISABLE TRIGGER` — this is acceptable since physical superuser access is already a boundary condition outside the application trust model.

---

## 5. Actor Identity Security

### 5.1 The `buildActor` Pattern

Actor identity is derived exclusively from the authenticated session object (`req.user`), which is populated by upstream authentication middleware before the finance router is entered. The `buildActor` function in `backend/routes/finance.v2.js`:

```javascript
function buildActor(req) {
  // Actor identity is derived exclusively from the authenticated session.
  // Never trust body-supplied actor_type or actor_id — doing so would allow
  // any caller to impersonate a human actor and bypass AI governance checks.
  const isAiAgent = req.user?.is_ai_agent === true || req.user?.role === 'ai_agent';
  return {
    id: req.user?.id || null,
    type: isAiAgent ? 'ai_agent' : 'human',
  };
}
```

The `actor.type` field drives the governance decision in `evaluateFinanceGovernance`. If a caller could supply `actor_type: 'human'` in the request body and have it trusted, an AI agent could bypass the `AI_BLOCKED_COMMANDS` block (which prevents AI from posting journal entries or approving finance actions). The `buildActor` function prevents this by never reading `actor_type` or `actor_id` from `req.body`.

### 5.2 Spoofing Prevention at the Route Layer

Every mutating finance route passes `actor: buildActor(req)` to the service layer:

- `POST /draft-invoices` → `service.createDraftInvoice({ actor: buildActor(req), ... })`
- `PATCH /draft-invoices/:id` → `service.updateDraftInvoice({ actor: buildActor(req), ... })`
- `POST /journal-drafts` → `service.createJournalDraft({ actor: buildActor(req), ... })`
- `POST /simulate/deal-won` → `service.simulateDealWon({ actor: buildActor(req), ... })`
- `POST /journal-entries/:id/reverse` → `service.reverseJournalEntry({ actor: buildActor(req), ... })`
- `POST /approvals/:id/approve` → `service.approveFinanceAction({ actor: buildActor(req), ... })`

The service layer must not accept a caller-supplied `actorType` or `actorId` parameter from the route. The actor object must flow in only from `buildActor(req)`.

### 5.3 Tenant Identity Injection

The `resolveTenantId` function in `finance.v2.js` reads tenant_id from `req.tenant?.id`, `req.query.tenant_id`, `req.body.tenant_id`, and `req.user.tenant_id` in priority order. The outer middleware then sets `req.financeTenantId` from this resolved value and passes it to service calls. Tenant isolation at the route layer is enforced by the `validateTenantAccess` middleware from `backend/middleware/validateTenant.js`, which is applied to all finance routes via `router.use(validateTenantAccess)`.

**Important note on `resolveTenantId`:** It accepts `req.body.tenant_id` as a fallback. For a regular authenticated (non-superadmin) user, `validateTenantAccess` will have already verified that the requested tenant matches the user's assigned tenant, so accepting it from the body is safe. However, the service layer must always use `req.financeTenantId` (the middleware-set value) and must never pass `req.body.tenant_id` directly to Supabase queries.

---

## 6. Migration Readiness Checklist

The following items must all be true before `backend/migrations/168_finance_ops_runtime_scaffold.sql` (and the companion RLS migration) can be applied to staging.

### Schema Creation (Migration 168 itself)

- [ ] **`finance` schema creation is idempotent.** `CREATE SCHEMA IF NOT EXISTS finance` is safe to run on staging — confirmed no existing `finance` schema in staging Supabase project.
- [ ] **Table creation is idempotent.** All `CREATE TABLE IF NOT EXISTS` statements are safe to re-run.
- [ ] **Index creation is idempotent.** All `CREATE INDEX IF NOT EXISTS` statements are safe to re-run.
- [ ] **No existing CRM tables are touched.** Migration 168 only creates objects in `finance.*` — verify by reading the migration: no `ALTER TABLE public.*` or `DROP TABLE` statements are present. Confirmed: migration 168 is additive only.
- [ ] **`NOTIFY pgrst, 'reload schema'` is NOT required for the new schema.** PostgREST only needs a reload when columns that are already in its cached schema change. Since the `finance` schema is not in PostgREST's `schemas` list (see Section 7), adding it does not require a pgrst reload for any existing CRM functionality. However, if `finance` is later added to the exposed schemas list, a reload will be required at that point.

### RLS Policies (Separate Migration — do not include in 168)

- [x] **JWT claim format confirmed.** All tenant IDs are UUIDs. The canonical expression `(SELECT (auth.jwt() ->> 'tenant_id')::uuid)` is already in production use on CRM tables (migrations 120, 131). No further verification needed.
- [ ] **Service role bypass confirmed.** Run a query on a finance table from the backend service role connection and confirm `(select auth.role()) = 'service_role'` evaluates to true, granting unrestricted access.
- [ ] **No-hard-delete triggers finalized.** The trigger SQL in Section 3.1 has been reviewed, tested on dev finance tables, and confirmed to raise exceptions correctly on both `authenticated` and `service_role` delete attempts.
- [ ] **`audit_events` immutability trigger tested.** The trigger in Section 4.1 has been tested: UPDATE on `audit_events` raises `P0002`, DELETE raises `P0002`.
- [ ] **`finance` schema NOT in PostgREST exposed schemas.** Verify the Supabase `schemas` config in the Supabase dashboard under API settings. The `finance` schema must not appear in the exposed schemas list until Section 7's readiness criteria are met.
- [ ] **Parallel agent coordination.** Per `docs/contributing/PARALLEL_AGENTS.md`, confirm no other agent has pushed changes to `feat/finance-ops-runtime` since this session fetched the branch. Verify `git fetch github` and check for divergence before pushing.
- [ ] **CHANGELOG.md updated** with migration 168 changes before committing.
- [ ] **Regression tests pass.** `docker exec aishacrm-backend npm test` runs clean with 0 failures after migration is applied to dev Docker environment.

### Additional Blockers Identified from Reading Migration 168

- [ ] **`entry_number` unique constraint on `journal_entries`** — `unique (tenant_id, entry_number)` will fail on INSERT if `entry_number` is null for multiple rows of the same tenant. The column is nullable (`entry_number text` with no `not null`). The service layer must either generate entry numbers or accept that this constraint only applies when a value is provided. Confirm the service layer behavior before applying to staging.
- [ ] **`journal_lines` has no `tenant_id` index** — the only index on `journal_lines` is `idx_finance_journal_lines_entry_id` (on `journal_entry_id`). Tenant isolation on `journal_lines` is inherited via the join to `journal_entries`. RLS on `journal_lines` will need to either JOIN to `journal_entries` for the tenant check or trust that tenant_id is always correctly denormalized. The current schema denormalizes `tenant_id` onto `journal_lines`, which is correct — but confirm the index `idx_finance_journal_lines_entry_id` is sufficient for expected query patterns.
- [ ] **`finance.accounts` name collision with `public.accounts`.** The `finance.accounts` table stores a chart of accounts (financial accounts), not CRM accounts. Ensure the domain service, route handlers, and any future Braid tools consistently qualify the schema (`finance.accounts` vs `public.accounts`) to prevent accidental cross-schema queries.
- [ ] **`finance.adapter_jobs` has no `tenant_id` FK to `public.tenant`** — and no FK to `finance.accounts`. This is intentional (adapter jobs are loosely coupled), but confirm this is by design before staging.

---

## 7. Finance Schema PostgREST Exposure

### Recommendation: Do NOT expose `finance` via PostgREST in v1.

**Rationale:**

Finance writes must always flow through the domain service layer to enforce governance checks, actor identity derivation, and audit event emission. If the `finance` schema is added to the PostgREST exposed schemas list, any authenticated client with a valid JWT could issue direct REST API calls to `https://<project>.supabase.co/rest/v1/` against finance tables. Even with RLS enabled, this would:

1. Bypass the `evaluateFinanceGovernance` check — no governance decision recorded.
2. Bypass the `buildActor` pattern — actor type not verified against session.
3. Bypass audit event emission — no `finance.audit_events` row created for the operation.
4. Potentially allow AI agents to INSERT journal entries directly (bypassing the `AI_BLOCKED_COMMANDS` block).

### How PostgREST Exposure is Prevented

Supabase exposes schemas through the API via the `schemas` configuration in the Supabase project settings (Dashboard → API → Exposed schemas). The default value is `public`. As long as `finance` is not added to this list, PostgREST will return 404 for any direct REST call to `finance.*` tables.

**Verify this is the case before applying RLS to staging:**

```sql
-- Run in Supabase SQL editor to confirm exposed schemas
select current_setting('pgrst.db_schemas');
```

The result must not include `finance`.

### If Finance Must Be Exposed via PostgREST in Future

If a future requirement (e.g., a reporting dashboard using the Supabase client directly) needs read access to finance data via PostgREST:

1. Add `finance` to the exposed schemas list.
2. Run `NOTIFY pgrst, 'reload schema'` to apply the change.
3. Verify all RLS `SELECT` policies are in place and working (tenant_match expression confirmed).
4. Write access must remain `service_only` — PostgREST write operations would then be blocked by the INSERT/UPDATE policies.
5. Audit this decision and document it in this file.

---

## 8. High-Risk Write Audit Trail

For operations that mutate finance state — post, approve, reverse, void — the minimum security metadata that must be captured in `finance.audit_events` at the time of each operation is specified below.

### 8.1 Required Fields on Every Audit Event

| Field             | Source                               | Notes                                                                                                                                                     |
| ----------------- | ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `event_type`      | Canonical finance event taxonomy     | A `finance.*` event name — e.g., `finance.journal.posted`, `finance.approval.approved`, `finance.journal.reversal_requested`. Never a command name.       |
| `command_type`    | Command name                         | e.g., `PostJournalEntryCommand` — carried in `payload.command_type` (and the `policy_decision` snapshot), never used as `event_type`.                     |
| `aggregate_type`  | Domain entity                        | e.g., `journal_entry`, `invoice`, `approval`                                                                                                              |
| `aggregate_id`    | Record UUID                          | The UUID of the affected finance record                                                                                                                   |
| `actor_id`        | `req.user.id` via `buildActor(req)`  | UUID of the authenticated user; `null` for system events                                                                                                  |
| `actor_type`      | `buildActor(req).type`               | `'human'` or `'ai_agent'` — derived from session only                                                                                                     |
| `source`          | Route identifier                     | e.g., `'finance.v2.approvals.approve'`, `'braid.finance.postJournalEntry'`                                                                                |
| `request_id`      | `req.headers['x-request-id']`        | Correlation ID from the HTTP request header; null if absent                                                                                               |
| `braid_trace_id`  | `req.body.braid_trace_id`            | Braid execution trace; null for human-initiated requests                                                                                                  |
| `correlation_id`  | Derived from request_id or generated | Links related events in a single operation chain                                                                                                          |
| `policy_decision` | Full `GovernanceDecision` object     | The complete snapshot from `evaluateFinanceGovernance` result, including `risk_level`, `policy_trace`, `approved`, `model`, `prompt_hash`, `evaluated_at` |
| `payload`         | Operation-specific                   | For post: entry id + amount + balance; for approve: approval id + approver; for reverse: original entry id + reason                                       |
| `tenant_id`       | `req.financeTenantId`                | Always the middleware-resolved UUID                                                                                                                       |
| `created_at`      | `now()` (DB default)                 | Do not allow caller to supply this value                                                                                                                  |

### 8.2 IP Address

The `finance.audit_events` table does not currently have an `ip_address` column. Two options:

**Option A (recommended for v1):** Store IP in the `payload` jsonb field:

```javascript
payload: {
  ...operationPayload,
  _meta: {
    ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim()
      || req.socket?.remoteAddress
      || null,
    user_agent: req.headers['user-agent'] || null,
  }
}
```

**Option B (v2 schema evolution):** Add `ip_address inet` and `user_agent text` columns to `finance.audit_events` in a follow-on migration.

Option A is preferred for v1 because it avoids schema changes and keeps the audit trail flexible. Option B should be considered when the table is exposed for reporting queries that filter by IP.

### 8.3 Policy Decision Snapshot

The `governance_policy_snapshot` jsonb column on `journal_entries` and `invoices` captures the governance decision at the time the record is created. This is distinct from the audit event's `policy_decision` field:

- `governance_policy_snapshot` on the record: the decision that allowed the record to be created or transitioned. Stays with the record forever.
- `policy_decision` in `audit_events`: the decision for each individual high-risk operation. Captures the state of the policy evaluator at the moment of the operation, including model version, prompt hash, and policy trace.

For high-risk operations (post, approve, reverse), both must be written atomically — the record's snapshot updated and the audit event inserted in the same transaction where possible.

### 8.4 Minimum Audit Event Example

```javascript
// Triggered by: PostJournalEntryCommand, ApproveFinanceActionCommand, RequestJournalReversalCommand.
// event_type is ALWAYS a canonical finance.* event name — never the command name.
// The command name is carried separately in payload.command_type.
// Example below is the journal-post case (PostJournalEntryCommand -> finance.journal.posted).
const auditEvent = {
  tenant_id: req.financeTenantId,
  event_type: 'finance.journal.posted', // canonical finance.* event — never a command name
  aggregate_type: 'journal_entry',
  aggregate_id: journalEntry.id,
  actor_id: actor.id, // from buildActor(req)
  actor_type: actor.type, // 'human' | 'ai_agent'
  source: 'finance.v2.journal_entries.post',
  request_id: req.headers['x-request-id'] || null,
  braid_trace_id: req.body?.braid_trace_id || null,
  correlation_id: req.headers['x-request-id'] || generateCorrelationId(),
  causation_id: null, // set if this event was caused by another event
  policy_decision: governanceDecision, // full object from evaluateFinanceGovernance
  payload: {
    command_type: commandType, // e.g. 'PostJournalEntryCommand' — command name lives here
    amount_cents: totalDebitCents,
    entry_number: journalEntry.entry_number,
    balance_verified: true,
    _meta: {
      ip_address: req.headers['x-forwarded-for']?.split(',')[0]?.trim() || null,
      user_agent: req.headers['user-agent'] || null,
    },
  },
};
```

---

## Appendix A: Architecture Decisions — Resolved

| ID  | Topic                               | Decision                                                                                                                                                                                                                                                                  |
| --- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F1  | `entry_number` nullable+unique      | **Generate before insert.** The domain service must generate an entry number (e.g., `JE-<timestamp>-<random>`) before INSERT so the unique constraint is always satisfied. Fix in `financeDomainService.js` before staging migration.                                     |
| F2  | `finance` schema PostgREST exposure | **Excluded by default.** `finance` must not appear in Supabase exposed schemas. Confirmed posture: Section 7 stands. Verify in Supabase Dashboard → API → Exposed schemas before staging.                                                                                 |
| F3  | service_role bypass                 | **Verify in staging.** Run a backend query against a finance table in the staging environment and confirm `(SELECT auth.role()) = 'service_role'` grants unrestricted access. This is a pre-staging confirmation step, not a code change.                                 |
| D1  | audit_events shape                  | **Use migration 168 payload-centered shape.** `before_state`/`after_state` columns from the scaffold doc are dropped. State is captured in `payload` as full aggregate snapshots. This is the shape implemented in `financeEventStore.js` and the current domain service. |

---

## Appendix B: Key File Locations

| File                                                      | Purpose                                                           |
| --------------------------------------------------------- | ----------------------------------------------------------------- |
| `backend/migrations/168_finance_ops_runtime_scaffold.sql` | Finance schema and table creation (dev draft)                     |
| `backend/migrations/058_consolidate_rls_contacts.sql`     | Live CRM RLS pattern — reference for claim expression             |
| `backend/migrations/080_ai_suggestions_table.sql`         | Alternative `current_setting` claim pattern                       |
| `backend/routes/finance.v2.js`                            | Finance API routes — actor identity, no DELETE routes             |
| `backend/middleware/validateTenant.js`                    | Tenant access enforcement middleware                              |
| `backend/lib/finance/financeGovernanceDecision.js`        | AI governance rules — `AI_BLOCKED_COMMANDS`, risk levels          |
| `docs/reference/DATABASE_REFERENCE.md`                    | Canonical schema reference — update when finance tables finalized |
| `docs/contributing/PARALLEL_AGENTS.md`                    | Coordination rules before pushing                                 |
