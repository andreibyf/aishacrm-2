-- Migration: Sync Health Monitoring Table
-- Purpose: Track synchronization health across tenants
-- Created: 2025-10-30

CREATE TABLE IF NOT EXISTS synchealth (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  status TEXT DEFAULT 'unknown',
  last_sync TIMESTAMPTZ,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ DEFAULT now()
);

-- Index for tenant-based queries
CREATE INDEX IF NOT EXISTS idx_synchealth_tenant ON synchealth(tenant_id);

-- Index for status filtering
CREATE INDEX IF NOT EXISTS idx_synchealth_status ON synchealth(status);

-- Index for recent sync queries
CREATE INDEX IF NOT EXISTS idx_synchealth_last_sync ON synchealth(last_sync DESC);

-- Enable Row Level Security
ALTER TABLE synchealth ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see their tenant's sync health
CREATE POLICY synchealth_tenant_isolation ON synchealth
  FOR ALL
  USING (
    tenant_id = current_setting('app.current_tenant_id', TRUE)::TEXT
    OR current_setting('app.bypass_rls', TRUE)::TEXT = 'true'
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON synchealth TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON synchealth TO service_role;
