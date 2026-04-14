-- Migration 151: LLM Activity Logs (persistent storage)
-- Adds a persistent audit table alongside the existing in-memory rolling buffer.
-- The buffer remains for real-time display (fast, no DB round-trip); this table
-- provides durable history that survives restarts, with 90-day retention.
-- Non-blocking insert path: backend inserts are fire-and-forget, never blocking response.
--
-- Conventions honored:
--   * RLS uses public.current_tenant_id() (JWT-based helper) to match the
--     standardized tenant-isolation pattern (migration
--     rls_fix_high3_standardize_tenant_isolation_pattern).
--   * UUID primary keys (gen_random_uuid) to eliminate ID-collision risk across
--     concurrent MCP containers.
--   * 90-day retention scheduled via pg_cron (extension already installed).

-- Ensure pgcrypto is available for gen_random_uuid (noop if already enabled).
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS llm_activity_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id     TEXT,                                    -- in-memory buffer id ("llm-<ts>-<rand>") for cross-ref
  tenant_id       UUID,                                    -- nullable for system/unscoped calls
  capability      TEXT NOT NULL,                           -- chat_tools, json_strict, etc.
  provider        TEXT NOT NULL,                           -- openai, anthropic, groq, local
  model           TEXT NOT NULL,
  node_id         TEXT,                                    -- e.g. "ai:chat:iter0"
  container_id    TEXT,                                    -- MCP_NODE_ID / HOSTNAME
  status          TEXT NOT NULL DEFAULT 'success',         -- success | error | failover
  duration_ms     INTEGER,
  error           TEXT,
  usage           JSONB,                                   -- { prompt_tokens, completion_tokens, total_tokens }
  tools_called    TEXT[] NOT NULL DEFAULT '{}',            -- array of tool names (never null for consistency)
  intent          TEXT,                                    -- e.g. LEAD_CREATE
  task_id         TEXT,
  request_id      TEXT,
  attempt         SMALLINT,
  total_attempts  SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Composite indexes aligned to dashboard query patterns.
-- Primary access is "this tenant, recent, maybe filtered by status or provider".
CREATE INDEX IF NOT EXISTS llm_activity_logs_created_at_idx
  ON llm_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_tenant_created_idx
  ON llm_activity_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_tenant_status_created_idx
  ON llm_activity_logs (tenant_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_provider_created_idx
  ON llm_activity_logs (provider, created_at DESC);

-- Row-level security matches the repo convention (current_tenant_id() JWT helper).
ALTER TABLE llm_activity_logs ENABLE ROW LEVEL SECURITY;

-- Service role (backend) has full access for inserts, retention cleanup, etc.
DROP POLICY IF EXISTS llm_activity_logs_service_all ON llm_activity_logs;
CREATE POLICY llm_activity_logs_service_all ON llm_activity_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users may read only their own tenant's logs.
-- Uses the standardized current_tenant_id() helper (JWT-derived, STABLE, SECURITY DEFINER).
DROP POLICY IF EXISTS llm_activity_logs_tenant_select ON llm_activity_logs;
CREATE POLICY llm_activity_logs_tenant_select ON llm_activity_logs
  FOR SELECT TO authenticated
  USING (tenant_id = public.current_tenant_id());

-- Retention cleanup: delete entries older than 90 days.
CREATE OR REPLACE FUNCTION public.cleanup_llm_activity_logs()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  removed bigint;
BEGIN
  DELETE FROM public.llm_activity_logs
    WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS removed = ROW_COUNT;
  RETURN removed;
END;
$$;

REVOKE ALL ON FUNCTION public.cleanup_llm_activity_logs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_llm_activity_logs() TO service_role;

-- Schedule retention daily at 03:15 UTC via pg_cron.
-- Safe to re-run: unschedule first if already scheduled.
DO $$
DECLARE
  existing_job_id BIGINT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    SELECT jobid INTO existing_job_id
      FROM cron.job
      WHERE jobname = 'llm_activity_logs_cleanup';
    IF existing_job_id IS NOT NULL THEN
      PERFORM cron.unschedule(existing_job_id);
    END IF;
    PERFORM cron.schedule(
      'llm_activity_logs_cleanup',
      '15 3 * * *',
      $cron$SELECT public.cleanup_llm_activity_logs();$cron$
    );
  END IF;
END
$$;

COMMENT ON TABLE  llm_activity_logs                      IS 'Persistent audit log for all LLM API calls. 90-day retention (pg_cron daily).';
COMMENT ON COLUMN llm_activity_logs.external_id          IS 'In-memory buffer id for cross-referencing real-time monitor entries.';
COMMENT ON FUNCTION public.cleanup_llm_activity_logs()   IS 'Deletes llm_activity_logs older than 90 days. Scheduled via pg_cron.';
