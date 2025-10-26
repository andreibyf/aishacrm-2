-- Performance Logs Table
-- Tracks API performance metrics for monitoring and optimization

CREATE TABLE IF NOT EXISTS performance_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  
  -- Request details
  method TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  status_code INTEGER,
  
  -- Performance metrics
  duration_ms INTEGER NOT NULL,
  response_time_ms INTEGER,
  db_query_time_ms INTEGER DEFAULT 0,
  
  -- Request metadata
  user_email TEXT,
  ip_address TEXT,
  user_agent TEXT,
  
  -- Error tracking
  error_message TEXT,
  error_stack TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_performance_logs_tenant ON performance_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_performance_logs_endpoint ON performance_logs(endpoint);
CREATE INDEX IF NOT EXISTS idx_performance_logs_created_at ON performance_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_performance_logs_status ON performance_logs(status_code);
CREATE INDEX IF NOT EXISTS idx_performance_logs_duration ON performance_logs(duration_ms);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_performance_logs_tenant_created 
  ON performance_logs(tenant_id, created_at DESC);

COMMENT ON TABLE performance_logs IS 'API performance metrics and request tracking';
COMMENT ON COLUMN performance_logs.duration_ms IS 'Total request duration in milliseconds';
COMMENT ON COLUMN performance_logs.response_time_ms IS 'Time to first byte in milliseconds';
COMMENT ON COLUMN performance_logs.db_query_time_ms IS 'Database query execution time';
