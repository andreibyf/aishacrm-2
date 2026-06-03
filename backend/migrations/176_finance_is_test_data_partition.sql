-- Finance Ops — Test/Live data-mode partition (slice 6a)
-- Migration 176. Dev-only draft. Do NOT apply to staging/production until the
-- Track F migration readiness checklist (docs/architecture/finance/
-- security-rls-hardening.md, Section 6) clears.
--
-- Finance is event-sourced. Test vs Live data is partitioned by an is_test_data
-- boolean on finance.audit_events (the canonical event stream, created in
-- migration 172, hardened append-only in 173). The write path stamps every
-- appended event with the tenant's current mode (test ⇒ true); hydrate/replay
-- filters to the current mode's events. The projection rebuild + read path
-- partitioning land in a later sub-slice.
--
-- Additive only: no existing table is dropped, and no CRM (public.*) object is
-- touched. Everything defaults to is_test_data = false (live) so existing
-- behaviour is preserved. Safe to re-run (idempotent).

-- ── Partition flag ────────────────────────────────────────────────────────────
-- Default false (live) so all pre-existing rows and unstamped writes remain Live.

alter table finance.audit_events
  add column if not exists is_test_data boolean not null default false;

-- ── Replay-ordering index (Test/Live aware) ───────────────────────────────────
-- Replay filters by mode FIRST, then orders by created_at ASC, id ASC. The
-- replay index from migration 173 (tenant_id, created_at, id) lacks is_test_data
-- as a leading filter, so drop it and recreate with is_test_data wedged in after
-- tenant_id. Backs replay()/query(): WHERE tenant_id = $1 AND is_test_data = $2
-- ORDER BY created_at ASC, id ASC.

drop index if exists finance.idx_finance_audit_events_replay;

create index if not exists idx_finance_audit_events_replay
  on finance.audit_events (tenant_id, is_test_data, created_at, id);

-- RLS is intentionally left untouched here. Finance RLS is finalized in
-- migration 175; this migration only adds the partition flag and its index.
