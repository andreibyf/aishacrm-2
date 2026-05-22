-- Finance Ops Phase 3 — companion RLS migration
-- Migration 171. Dev-only DRAFT. Do NOT apply to staging/production until the
-- Phase 3-2 staging-readiness review clears (docs/architecture/finance/
-- phase-2c-rls-application-plan.md Section 7).
--
-- Enables Row-Level Security on all 9 finance tables (the 8 created in
-- migration 168 plus finance.projection_state created in migration 170) and
-- installs the finalized RLS policy set and the no-hard-delete ledger triggers.
--
-- Policy model (security-rls-hardening.md Section 2, finalized tenant
-- expression in phase-2c-rls-application-plan.md Section 3):
--   tenant_match (SELECT) =
--     tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
--     or (select auth.role()) = 'service_role'
--   service_only (INSERT/UPDATE) =
--     (select auth.role()) = 'service_role'
--   DENY (DELETE on immutable tables) = using (false)
--
-- The backend connects with the Supabase service_role key, which bypasses RLS
-- entirely. RLS here is defense-in-depth for the direct-PostgREST path; the
-- no-hard-delete triggers below are the authoritative guard against
-- service_role deletes on the ledger tables.
--
-- Additive only: no existing table is altered or dropped, and no CRM (public.*)
-- object is touched. Safe to re-run (idempotent): every statement uses
-- create-or-replace, drop policy if exists, or drop trigger if exists.

-- ── Enable Row-Level Security on all 9 finance tables ─────────────────────────
alter table finance.accounts         enable row level security;
alter table finance.journal_entries  enable row level security;
alter table finance.journal_lines    enable row level security;
alter table finance.invoices         enable row level security;
alter table finance.invoice_lines    enable row level security;
alter table finance.approvals        enable row level security;
alter table finance.audit_events     enable row level security;
alter table finance.adapter_jobs     enable row level security;
alter table finance.projection_state enable row level security;

-- ── finance.accounts ──────────────────────────────────────────────────────────
drop policy if exists finance_accounts_select on finance.accounts;
create policy finance_accounts_select on finance.accounts
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_accounts_insert on finance.accounts;
create policy finance_accounts_insert on finance.accounts
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_accounts_update on finance.accounts;
create policy finance_accounts_update on finance.accounts
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists finance_accounts_delete on finance.accounts;
create policy finance_accounts_delete on finance.accounts
  for delete using (false);

-- ── finance.journal_entries ────────────────────────────────────────────────────
drop policy if exists finance_je_select on finance.journal_entries;
create policy finance_je_select on finance.journal_entries
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_je_insert on finance.journal_entries;
create policy finance_je_insert on finance.journal_entries
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_je_update on finance.journal_entries;
create policy finance_je_update on finance.journal_entries
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists finance_je_delete on finance.journal_entries;
create policy finance_je_delete on finance.journal_entries
  for delete using (false);

-- ── finance.journal_lines ─────────────────────────────────────────────────────
drop policy if exists finance_jl_select on finance.journal_lines;
create policy finance_jl_select on finance.journal_lines
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_jl_insert on finance.journal_lines;
create policy finance_jl_insert on finance.journal_lines
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_jl_update on finance.journal_lines;
create policy finance_jl_update on finance.journal_lines
  for update using (false);

drop policy if exists finance_jl_delete on finance.journal_lines;
create policy finance_jl_delete on finance.journal_lines
  for delete using (false);

-- ── finance.invoices ──────────────────────────────────────────────────────────
drop policy if exists finance_invoices_select on finance.invoices;
create policy finance_invoices_select on finance.invoices
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_invoices_insert on finance.invoices;
create policy finance_invoices_insert on finance.invoices
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_invoices_update on finance.invoices;
create policy finance_invoices_update on finance.invoices
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists finance_invoices_delete on finance.invoices;
create policy finance_invoices_delete on finance.invoices
  for delete using (false);

-- ── finance.invoice_lines ─────────────────────────────────────────────────────
drop policy if exists finance_invoice_lines_select on finance.invoice_lines;
create policy finance_invoice_lines_select on finance.invoice_lines
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_invoice_lines_insert on finance.invoice_lines;
create policy finance_invoice_lines_insert on finance.invoice_lines
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_invoice_lines_update on finance.invoice_lines;
create policy finance_invoice_lines_update on finance.invoice_lines
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists finance_invoice_lines_delete on finance.invoice_lines;
create policy finance_invoice_lines_delete on finance.invoice_lines
  for delete using (false);

-- ── finance.approvals ─────────────────────────────────────────────────────────
drop policy if exists finance_approvals_select on finance.approvals;
create policy finance_approvals_select on finance.approvals
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_approvals_insert on finance.approvals;
create policy finance_approvals_insert on finance.approvals
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_approvals_update on finance.approvals;
create policy finance_approvals_update on finance.approvals
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists finance_approvals_delete on finance.approvals;
create policy finance_approvals_delete on finance.approvals
  for delete using (false);

-- ── finance.audit_events ─────────────────────────────────────────────────────
drop policy if exists finance_audit_events_select on finance.audit_events;
create policy finance_audit_events_select on finance.audit_events
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_audit_events_insert on finance.audit_events;
create policy finance_audit_events_insert on finance.audit_events
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_audit_events_update on finance.audit_events;
create policy finance_audit_events_update on finance.audit_events
  for update using (false);

drop policy if exists finance_audit_events_delete on finance.audit_events;
create policy finance_audit_events_delete on finance.audit_events
  for delete using (false);

-- ── finance.adapter_jobs ──────────────────────────────────────────────────────
drop policy if exists finance_adapter_jobs_select on finance.adapter_jobs;
create policy finance_adapter_jobs_select on finance.adapter_jobs
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_adapter_jobs_insert on finance.adapter_jobs;
create policy finance_adapter_jobs_insert on finance.adapter_jobs
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_adapter_jobs_update on finance.adapter_jobs;
create policy finance_adapter_jobs_update on finance.adapter_jobs
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

drop policy if exists finance_adapter_jobs_delete on finance.adapter_jobs;
create policy finance_adapter_jobs_delete on finance.adapter_jobs
  for delete using (false);

-- ── finance.projection_state ──────────────────────────────────────────────────
-- projection_state is a rebuildable read-model cache, not financial truth. It
-- gets tenant_match SELECT and service_only INSERT/UPDATE, but NO USING (false)
-- DELETE policy: service_role may delete/truncate it (it is rebuilt by replay()
-- from the event stream, which remains the source of truth).
drop policy if exists finance_projection_state_select on finance.projection_state;
create policy finance_projection_state_select on finance.projection_state
  for select using (
    tenant_id = (select (auth.jwt() ->> 'tenant_id')::uuid)
    or (select auth.role()) = 'service_role'
  );

drop policy if exists finance_projection_state_insert on finance.projection_state;
create policy finance_projection_state_insert on finance.projection_state
  for insert with check ((select auth.role()) = 'service_role');

drop policy if exists finance_projection_state_update on finance.projection_state;
create policy finance_projection_state_update on finance.projection_state
  for update using ((select auth.role()) = 'service_role')
  with check ((select auth.role()) = 'service_role');

-- ── No-hard-delete ledger triggers ────────────────────────────────────────────
-- The USING (false) DELETE policies above block deletes from the authenticated
-- role only. The backend uses the service_role key, which bypasses RLS, so a
-- BEFORE DELETE trigger is the authoritative guard against service_role deletes
-- on the immutable ledger tables (security-rls-hardening.md Section 3.1).

-- Unconditional block — applied to journal_entries, journal_lines, audit_events.
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

drop trigger if exists trg_no_delete_journal_entries on finance.journal_entries;
create trigger trg_no_delete_journal_entries
  before delete on finance.journal_entries
  for each row execute function finance.prevent_hard_delete();

drop trigger if exists trg_no_delete_journal_lines on finance.journal_lines;
create trigger trg_no_delete_journal_lines
  before delete on finance.journal_lines
  for each row execute function finance.prevent_hard_delete();

drop trigger if exists trg_no_delete_audit_events on finance.audit_events;
create trigger trg_no_delete_audit_events
  before delete on finance.audit_events
  for each row execute function finance.prevent_hard_delete();

-- Conditional block — applied to invoices and approvals: draft records may be
-- legitimately cancelled, so only non-draft rows are protected.
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

drop trigger if exists trg_no_delete_invoices on finance.invoices;
create trigger trg_no_delete_invoices
  before delete on finance.invoices
  for each row execute function finance.prevent_hard_delete_posted();

drop trigger if exists trg_no_delete_approvals on finance.approvals;
create trigger trg_no_delete_approvals
  before delete on finance.approvals
  for each row execute function finance.prevent_hard_delete_posted();

-- finance.accounts, finance.invoice_lines, finance.adapter_jobs carry USING
-- (false) DELETE policies but no no-hard-delete trigger: a service_role delete
-- on these operational records is acceptable (security-rls-hardening.md §3.1).
-- finance.audit_events UPDATE/DELETE/TRUNCATE is additionally guarded by the
-- append-only triggers installed in migration 169.
-- finance.projection_state is a rebuildable cache — intentionally no
-- no-hard-delete trigger and no DELETE policy.
