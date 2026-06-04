-- 178_finance_audit_events_allow_test_delete.sql
--
-- Codex PR #634 P1 — let the Clear Test Data path delete TEST finance events.
--
-- finance.audit_events is append-only: migration 173 installs
-- `trg_audit_events_no_delete` (→ finance.audit_events_immutable()) and migration
-- 175 installs `trg_no_delete_audit_events` (→ finance.prevent_hard_delete()).
-- Both BEFORE DELETE triggers fire for EVERY row, so the per-tenant QA "Clear Test
-- Data" path (clearFinanceTestData.js: `DELETE ... WHERE is_test_data = true`)
-- always raises and the sandbox finance events/projections are never cleared.
--
-- Fix: recreate the two audit_events delete triggers with a WHEN guard so they
-- fire ONLY for LIVE events. Test events (is_test_data = true) bypass the
-- immutability triggers and are deletable, enabling scoped sandbox cleanup. LIVE
-- finance events remain strictly append-only — the immutability guarantee for
-- real audit data is unchanged.
--
-- Depends on the is_test_data column (migration 176). The shared trigger
-- FUNCTIONS are left untouched (prevent_hard_delete() still protects
-- journal_entries / journal_lines); only the audit_events TRIGGERS gain the
-- test-data WHEN condition.

drop trigger if exists trg_audit_events_no_delete on finance.audit_events;
create trigger trg_audit_events_no_delete
  before delete on finance.audit_events
  for each row
  when (old.is_test_data is distinct from true)
  execute function finance.audit_events_immutable();

drop trigger if exists trg_no_delete_audit_events on finance.audit_events;
create trigger trg_no_delete_audit_events
  before delete on finance.audit_events
  for each row
  when (old.is_test_data is distinct from true)
  execute function finance.prevent_hard_delete();
