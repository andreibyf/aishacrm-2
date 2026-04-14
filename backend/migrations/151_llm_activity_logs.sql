-- Migration 151: LLM Activity Logs (persistent storage)
-- Adds a persistent audit table alongside the existing in-memory rolling buffer.
-- The buffer remains for real-time display (fast, no DB round-trip); this table
-- provides durable history that survives restarts, with 90-day retention.
-- Non-blocking insert path: backend inserts are fire-and-forget, never blocking response.

CREATE TABLE IF NOT EXISTS llm_activity_logs (
  id              TEXT PRIMARY KEY,                        -- e.g. "llm-<ts>-<rand>"
  tenant_id       UUID,                                    -- nullable for system calls
  capability      TEXT NOT NULL,                           -- chat_tools, json_strict, etc.
  provider        TEXT NOT NULL,                           -- openai, anthropic, groq, local
  model           TEXT NOT NULL,
  node_id         TEXT,                                    -- e.g. "ai:chat:iter0"
  container_id    TEXT,                                    -- MCP_NODE_ID / HOSTNAME
  status          TEXT NOT NULL DEFAULT 'success',         -- success | error | failover
  duration_ms     INTEGER,
  error           TEXT,
  usage           JSONB,                                   -- { prompt_tokens, completion_tokens, total_tokens }
  tools_called    TEXT[],                                  -- array of tool names
  intent          TEXT,                                    -- e.g. LEAD_CREATE
  task_id         TEXT,
  request_id      TEXT,
  attempt         SMALLINT,
  total_attempts  SMALLINT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for dashboard queries
CREATE INDEX IF NOT EXISTS llm_activity_logs_created_at_idx   ON llm_activity_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_tenant_idx        ON llm_activity_logs (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_provider_idx      ON llm_activity_logs (provider, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_status_idx        ON llm_activity_logs (status, created_at DESC);
CREATE INDEX IF NOT EXISTS llm_activity_logs_capability_idx    ON llm_activity_logs (capability, created_at DESC);

-- RLS: admin/superadmin read; backend service role insert
ALTER TABLE llm_activity_logs ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY llm_activity_logs_service_all ON llm_activity_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can see their own tenant's logs (matches repo UUID-based pattern)
CREATE POLICY llm_activity_logs_tenant_select ON llm_activity_logs
  FOR SELECT TO authenticated
  USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Cleanup function: delete entries older than 90 days
CREATE OR REPLACE FUNCTION cleanup_llm_activity_logs()
RETURNS void LANGUAGE sql AS $$
  DELETE FROM llm_activity_logs WHERE created_at < NOW() - INTERVAL '90 days';
$$;

COMMENT ON TABLE llm_activity_logs IS 'Persistent audit log for all LLM API calls. 90-day retention.';
