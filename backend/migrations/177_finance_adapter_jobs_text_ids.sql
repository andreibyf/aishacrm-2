-- 177_finance_adapter_jobs_text_ids.sql
--
-- Codex PR #633 P1 — finance.adapter_jobs.id / aggregate_id must be TEXT.
--
-- The finance domain service generates PREFIXED string identifiers — adapter
-- jobs as `adapter_job_<uuid>` and journal aggregates as `journal_<uuid>`
-- (financeDomainService.js / simulateDealWon). But 172_finance_ops_runtime_scaffold.sql
-- declared finance.adapter_jobs.id and aggregate_id as `uuid`. The persistent
-- write path's adapter-jobs materializer (persistentAdapterJobWriter.js) inserts
-- those prefixed strings, which PostgreSQL rejects against `uuid` columns
-- (22P02 invalid input syntax). Because the materializer's per-row insert is
-- non-fatal, the write still returns success and the projection still shows a
-- queued job — but no row lands in finance.adapter_jobs, so the SQL adapter
-- worker (adapterJobProcessor.claimPersistent) never has a runnable job.
--
-- Widen the two columns to `text` so the canonical table accepts the app's ID
-- format. `tenant_id` stays `uuid` — it is a real tenant UUID. The PK default
-- (gen_random_uuid()) is dropped: every insert provides the id explicitly, and a
-- bare uuid default would not match the prefixed ID convention used elsewhere.
--
-- Idempotent-ish: the ALTERs are no-ops if already text. Safe — adapter_jobs.id
-- is a leaf PK (no FK references it) and aggregate_id has no FK.

alter table finance.adapter_jobs
  alter column id drop default;

alter table finance.adapter_jobs
  alter column id type text using id::text;

alter table finance.adapter_jobs
  alter column aggregate_id type text using aggregate_id::text;
