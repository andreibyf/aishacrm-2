-- Additional / optimized indexes for performance_logs heavy access patterns
-- Safe to run multiple times; uses IF NOT EXISTS guards

-- Narrow index for recent error scans
CREATE INDEX IF NOT EXISTS idx_performance_logs_errors_recent
  ON performance_logs (created_at DESC)
  WHERE status_code >= 400;

-- Partial index for server errors only (rare, accelerates incident triage)
CREATE INDEX IF NOT EXISTS idx_performance_logs_server_errors
  ON performance_logs (created_at DESC)
  WHERE status_code >= 500;

-- Covering index for mixed analytic filters (status_code + tenant_id + created_at)
CREATE INDEX IF NOT EXISTS idx_performance_logs_tenant_status_created
  ON performance_logs (tenant_id, status_code, created_at DESC);

-- Specialized index for duration outliers (focus on high durations)
CREATE INDEX IF NOT EXISTS idx_performance_logs_slow_requests
  ON performance_logs (duration_ms DESC, created_at DESC)
  WHERE duration_ms > 750;

-- Composite index for frequent metrics aggregation excluding cache hits (non-304)
CREATE INDEX IF NOT EXISTS idx_performance_logs_non304_recent
  ON performance_logs (created_at DESC, status_code)
  WHERE status_code <> 304;

-- Track origin IP + created_at for rate limiting forensic investigations
CREATE INDEX IF NOT EXISTS idx_performance_logs_ip_recent
  ON performance_logs (ip_address, created_at DESC);

-- Ensure existing baseline composite remains (created_at descending already present)
-- Recheck execution plans after applying; drop any redundant indexes if overlap detected.
