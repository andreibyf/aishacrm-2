-- Monitoring System Database Tables
-- Tables for rate limit tracking, IP blocking, and system monitoring

-- Rate limit violations table
CREATE TABLE IF NOT EXISTS rate_limit_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL,
  tenant_id UUID REFERENCES tenants(id) ON DELETE SET NULL,
  user_id UUID,
  endpoint TEXT NOT NULL,
  method TEXT NOT NULL,
  limit_type TEXT NOT NULL DEFAULT 'default', -- 'default', 'auth', 'write', 'read', 'refresh'
  user_agent TEXT,
  cloudflare_ray TEXT,
  cloudflare_country TEXT,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for rate limit violations
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_ip ON rate_limit_violations(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_tenant ON rate_limit_violations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_occurred_at ON rate_limit_violations(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_endpoint ON rate_limit_violations(endpoint);
CREATE INDEX IF NOT EXISTS idx_rate_limit_violations_limit_type ON rate_limit_violations(limit_type);

-- Blocked IPs table
CREATE TABLE IF NOT EXISTS blocked_ips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address INET NOT NULL UNIQUE,
  reason TEXT NOT NULL,
  blocked_by TEXT NOT NULL, -- user_id or 'system'
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ, -- NULL for permanent blocks
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  unblocked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for blocked IPs
CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip_address);
CREATE INDEX IF NOT EXISTS idx_blocked_ips_active ON blocked_ips(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_blocked_ips_expires_at ON blocked_ips(expires_at) WHERE expires_at IS NOT NULL;

-- Function to get top rate limit offenders
CREATE OR REPLACE FUNCTION get_top_rate_limit_offenders(
  p_since TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 10
)
RETURNS TABLE (
  ip TEXT,
  count BIGINT,
  endpoints TEXT[],
  country TEXT,
  first_seen TIMESTAMPTZ,
  last_seen TIMESTAMPTZ
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    host(rlv.ip_address) AS ip,
    COUNT(*) AS count,
    ARRAY_AGG(DISTINCT rlv.endpoint) AS endpoints,
    MAX(rlv.cloudflare_country) AS country,
    MIN(rlv.occurred_at) AS first_seen,
    MAX(rlv.occurred_at) AS last_seen
  FROM rate_limit_violations rlv
  WHERE rlv.occurred_at >= p_since
  GROUP BY host(rlv.ip_address)
  ORDER BY count DESC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- RLS policies (if using RLS)
-- Note: These tables are global and not tenant-scoped
-- Only superadmin should have access via application logic

ALTER TABLE rate_limit_violations ENABLE ROW LEVEL SECURITY;
ALTER TABLE blocked_ips ENABLE ROW LEVEL SECURITY;

-- Policy: Allow service role to read/write
CREATE POLICY IF NOT EXISTS "Service role full access on rate_limit_violations"
  ON rate_limit_violations
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE POLICY IF NOT EXISTS "Service role full access on blocked_ips"
  ON blocked_ips
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE rate_limit_violations IS 'Tracks rate limit violations for analytics and security monitoring';
COMMENT ON TABLE blocked_ips IS 'Manages blocked IP addresses with expiration support';
COMMENT ON COLUMN rate_limit_violations.limit_type IS 'Type of rate limit hit: default, auth, write, read, refresh';
COMMENT ON COLUMN blocked_ips.expires_at IS 'NULL for permanent blocks, timestamp for temporary blocks';
