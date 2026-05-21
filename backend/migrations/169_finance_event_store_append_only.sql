-- Finance Ops Phase 2B — persistent event store append-only hardening
-- Migration 169. Dev-only draft. Do NOT apply to staging/production until the
-- Track F migration readiness checklist (docs/architecture/finance/
-- security-rls-hardening.md, Section 6) clears.
--
-- finance.audit_events (created in migration 168) is the Phase 2B persistent
-- event store: the canonical Postgres-backed finance event stream, not merely
-- an audit side table. This migration makes that table append-only and adds a
-- replay-ordering index.
--
-- Additive only: no existing table is altered or dropped, and no CRM (public.*)
-- object is touched. Safe to re-run (idempotent).

-- ── Append-only enforcement ───────────────────────────────────────────────────
-- Block UPDATE / DELETE / TRUNCATE on the event store. The backend connects
-- with the Supabase service_role key, which bypasses RLS, so a BEFORE trigger
-- is the authoritative append-only guard (see audit-evidence-layer.md Section 2).

create or replace function finance.audit_events_immutable()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'finance.audit_events is append-only: TRUNCATE is not permitted'
      using errcode = 'restrict_violation';
  end if;
  raise exception
    'finance.audit_events is append-only: % is not permitted (event id=%)',
    tg_op, old.id
    using errcode = 'restrict_violation';
  return null;
end;
$$;

drop trigger if exists trg_audit_events_no_update on finance.audit_events;
create trigger trg_audit_events_no_update
  before update on finance.audit_events
  for each row execute function finance.audit_events_immutable();

drop trigger if exists trg_audit_events_no_delete on finance.audit_events;
create trigger trg_audit_events_no_delete
  before delete on finance.audit_events
  for each row execute function finance.audit_events_immutable();

-- TRUNCATE bypasses row-level triggers — guard it at statement level.
drop trigger if exists trg_audit_events_no_truncate on finance.audit_events;
create trigger trg_audit_events_no_truncate
  before truncate on finance.audit_events
  for each statement execute function finance.audit_events_immutable();

-- ── Replay-ordering index ─────────────────────────────────────────────────────
-- Backs replay() and query(): WHERE tenant_id = $1 ORDER BY created_at ASC, id ASC.
-- The frozen Track A contract orders replay by created_at ASC with the event
-- UUID as the deterministic tie-break.

create index if not exists idx_finance_audit_events_replay
  on finance.audit_events (tenant_id, created_at, id);

-- RLS is intentionally left disabled here. Finance RLS is finalized in a
-- separate migration once the Track F readiness checklist clears.
