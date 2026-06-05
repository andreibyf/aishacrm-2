-- 179_finance_audit_events_append_seq.sql
--
-- Codex PR #633 — preserve APPEND ORDER in persistent replay.
--
-- financeEventStore.pg.js replay/query ordered by (created_at, id). `created_at`
-- is the DB clock (default now()) and `id` is a random UUID, so two events a
-- single command appends in the same instant tie on created_at and then order by
-- UUID — which does NOT match append order. e.g. simulateDealWon appends
-- `finance.journal.draft_created` then `finance.approval.requested`; if the
-- approval's UUID sorts first, `rebuildBucketFromEvents` (hydrate) and the journal
-- projection apply the pending snapshot before the draft, leaving the journal
-- visible as `draft` on the next persistent read. The in-memory store already
-- tie-breaks on a monotonic `_seq`; this gives the Postgres store the same
-- guarantee.
--
-- Add a monotonic append column and re-key the replay index to
-- (tenant_id, created_at, seq); financeEventStore.pg.js now orders replay/query by
-- (created_at, seq). `seq` is DB-assigned (identity) — the event-store INSERT never
-- writes it, exactly like created_at.

alter table finance.audit_events
  add column if not exists seq bigint generated always as identity;

-- Re-point the replay-ordering index from (…, id) to (…, seq) — 173 created the
-- original `idx_finance_audit_events_replay` on (tenant_id, created_at, id).
drop index if exists finance.idx_finance_audit_events_replay;
create index if not exists idx_finance_audit_events_replay
  on finance.audit_events (tenant_id, created_at, seq);
