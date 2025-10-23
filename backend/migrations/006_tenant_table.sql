-- Create tenant table for multi-tenant support
-- This table stores tenant information and settings

CREATE TABLE IF NOT EXISTS tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL UNIQUE,
  name TEXT,
  settings JSONB DEFAULT '{}',
  status TEXT DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Index for efficient tenant lookups
CREATE INDEX IF NOT EXISTS idx_tenant_tenant_id ON tenant(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_status ON tenant(status);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_tenant_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER tenant_updated_at_trigger
  BEFORE UPDATE ON tenant
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_updated_at();
