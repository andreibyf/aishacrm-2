-- Add tenant_integrations table

CREATE TABLE IF NOT EXISTS tenant_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  integration_name TEXT,
  is_active BOOLEAN DEFAULT true,
  api_credentials JSONB DEFAULT '{}',
  config JSONB DEFAULT '{}',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ
);

-- Update created_date from created_at for consistency
UPDATE tenant_integrations SET created_date = created_at WHERE created_date IS NULL;

-- Add trigger to sync created_date with created_at
DROP TRIGGER IF EXISTS sync_tenant_integrations_created_date ON tenant_integrations;
CREATE TRIGGER sync_tenant_integrations_created_date
  BEFORE INSERT OR UPDATE ON tenant_integrations
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_tenant ON tenant_integrations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_type ON tenant_integrations(tenant_id, integration_type);
CREATE INDEX IF NOT EXISTS idx_tenant_integrations_active ON tenant_integrations(tenant_id, is_active);
