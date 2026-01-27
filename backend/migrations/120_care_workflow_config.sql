-- Migration: 120_care_workflow_config.sql
-- Purpose: Per-tenant CARE workflow configuration
-- 
-- This table allows each tenant to configure multiple CARE workflows
-- instead of relying on a global environment variable.

-- Care workflow config table
CREATE TABLE IF NOT EXISTS care_workflow_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  
  -- Workflow reference
  workflow_id UUID NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  
  -- Optional name/description for this config
  name TEXT,
  description TEXT,
  
  -- Webhook configuration (derived from workflow or custom)
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Feature flags
  is_enabled BOOLEAN DEFAULT true,
  state_write_enabled BOOLEAN DEFAULT false,
  shadow_mode BOOLEAN DEFAULT true,
  
  -- Timeout/retry settings (override global defaults)
  webhook_timeout_ms INTEGER DEFAULT 3000,
  webhook_max_retries INTEGER DEFAULT 2,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Unique constraint - one config per workflow per tenant
  UNIQUE(tenant_id, workflow_id)
);

-- Index for quick tenant lookup
CREATE INDEX IF NOT EXISTS idx_care_workflow_config_tenant_id 
  ON care_workflow_config(tenant_id);

-- Index for workflow lookup
CREATE INDEX IF NOT EXISTS idx_care_workflow_config_workflow_id 
  ON care_workflow_config(workflow_id);

-- Index for finding enabled configs
CREATE INDEX IF NOT EXISTS idx_care_workflow_config_enabled 
  ON care_workflow_config(tenant_id, is_enabled) WHERE is_enabled = true;

-- RLS policies
ALTER TABLE care_workflow_config ENABLE ROW LEVEL SECURITY;

-- Drop existing policy if it exists (for re-running migration)
DROP POLICY IF EXISTS care_workflow_config_tenant_isolation ON care_workflow_config;

-- Tenant isolation: users can only see their own tenant's config
CREATE POLICY care_workflow_config_tenant_isolation ON care_workflow_config
  FOR ALL
  USING (
    tenant_id IN (
      SELECT id FROM tenant WHERE id = current_setting('app.tenant_id', true)::uuid
    )
    OR current_setting('app.role', true) = 'superadmin'
  );

-- Comments for documentation
COMMENT ON TABLE care_workflow_config IS 'Per-tenant CARE workflow configuration';
COMMENT ON COLUMN care_workflow_config.workflow_id IS 'Reference to workflow table - used to derive webhook_url if not custom';
COMMENT ON COLUMN care_workflow_config.webhook_url IS 'Custom webhook URL (auto-generated from workflow_id if not set)';
COMMENT ON COLUMN care_workflow_config.is_enabled IS 'Whether CARE triggers are enabled for this tenant';
COMMENT ON COLUMN care_workflow_config.state_write_enabled IS 'Whether to persist state to customer_care_state tables';
COMMENT ON COLUMN care_workflow_config.shadow_mode IS 'If true, log but do not execute actions';
