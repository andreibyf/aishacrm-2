-- Finance Ops Phase 2C-4 — persistent projection store
-- Migration 170. Dev-only DRAFT. Do NOT apply to staging/production until the
-- staging-readiness gate clears (docs/architecture/finance/
-- phase-2c-rls-application-plan.md Section 7; staging-rls-validation.md Section 6).
--
-- Backs the persistent-projection-store decision (Option A — Postgres) recorded
-- in docs/architecture/finance/persistent-projection-store-plan.md. One row per
-- (projection_name, tenant_id) holds the serialized projection read model
-- (state_json) plus the runtime ProjectionState metadata (cursor, status,
-- schema_version) defined in projection-runtime.md Section 3.
--
-- Unlike finance.audit_events (the append-only event store), this table is
-- intentionally MUTABLE: state_json is a durable cache of derived state and is
-- rebuilt by replay() from the event stream, which remains the source of truth.
-- No append-only / no-hard-delete trigger is installed here.
--
-- Additive only: no existing table is altered or dropped, and no CRM (public.*)
-- object is touched. Safe to re-run (idempotent).

create table if not exists finance.projection_state (
  projection_name   text        not null,
  tenant_id         uuid        not null,
  schema_version    integer     not null default 1,
  cursor_event_id   uuid,
  cursor_created_at timestamptz,
  state_json        jsonb       not null default '{}'::jsonb,
  status            text        not null default 'idle'
                      check (status in ('idle', 'replaying', 'degraded')),
  degraded_reason   text,
  last_rebuilt_at   timestamptz,
  updated_at        timestamptz not null default now(),
  primary key (projection_name, tenant_id)
);

-- The cursor is { created_at, id } or null — both halves move together.
-- Either both cursor columns are populated, or both are null (a fresh
-- projection that has applied nothing yet).
alter table finance.projection_state
  drop constraint if exists finance_projection_state_cursor_pair_chk;
alter table finance.projection_state
  add constraint finance_projection_state_cursor_pair_chk
  check (
    (cursor_event_id is null and cursor_created_at is null)
    or (cursor_event_id is not null and cursor_created_at is not null)
  );

-- Per-tenant lookup (replayAll(tenantId)) and degraded-projection scans for
-- observability — the PK (projection_name, tenant_id) does not serve a
-- tenant-only predicate.
create index if not exists idx_finance_projection_state_tenant_status
  on finance.projection_state (tenant_id, status);

-- updated_at must authoritatively reflect the last ROW MUTATION, not just the
-- INSERT time. The column default `now()` only fills updated_at on INSERT; this
-- BEFORE UPDATE trigger stamps it on every UPDATE so the value is correct
-- regardless of whether the writing component (the projection store provider)
-- remembers to set it. Function lives in the finance schema — no public.* object
-- is touched. Idempotent: create-or-replace + drop-if-exists before create.
create or replace function finance.set_projection_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_projection_state_set_updated_at on finance.projection_state;
create trigger trg_projection_state_set_updated_at
  before update on finance.projection_state
  for each row execute function finance.set_projection_state_updated_at();

-- RLS is intentionally left disabled here. Finance RLS is finalized in the
-- single companion RLS migration once the staging-readiness gate clears; that
-- migration covers finance.projection_state alongside the other finance tables
-- (tenant_match SELECT, service_only writes).
