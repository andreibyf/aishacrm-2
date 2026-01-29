-- Migration: 120_care_workflow_config_v2.sql
-- Purpose: Per-tenant CARE workflow configuration (Phase 3)
-- 
-- This table allows each tenant to configure CARE workflows individually
-- instead of relying on global environment variables.
--
-- Two modes:
--   1. Link to AiSHA workflow (workflow_id set, webhook_url derived)
--   2. External webhook (workflow_id NULL, webhook_url required)

-- Care workflow config table
CREATE TABLE IF NOT EXISTS care_workflow_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  
  -- Workflow reference (OPTIONAL - for AiSHA workflows)
  -- If set, webhook_url can be auto-derived from workflow.webhook_url
  -- If null, must provide custom webhook_url
  workflow_id UUID REFERENCES workflow(id) ON DELETE CASCADE,
  
  -- Optional name/description for this config
  name TEXT,
  description TEXT,
  
  -- Webhook configuration
  -- If workflow_id is set, this can be auto-populated from workflow table
  -- If workflow_id is null, this is REQUIRED
  webhook_url TEXT,
  webhook_secret TEXT,
  
  -- Feature flags
  is_enabled BOOLEAN DEFAULT false,  -- Safe default: disabled until explicitly enabled
  state_write_enabled BOOLEAN DEFAULT false,
  shadow_mode BOOLEAN DEFAULT true,  -- Log-only mode by default
  
  -- Timeout/retry settings (override global defaults)
  webhook_timeout_ms INTEGER DEFAULT 3000 CHECK (webhook_timeout_ms > 0 AND webhook_timeout_ms <= 30000),
  webhook_max_retries INTEGER DEFAULT 2 CHECK (webhook_max_retries >= 0 AND webhook_max_retries <= 5),
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Constraint: Either workflow_id OR webhook_url must be set
  CONSTRAINT care_config_webhook_required 
    CHECK (workflow_id IS NOT NULL OR webhook_url IS NOT NULL),
  
  -- Unique constraint - one config per tenant (simplified from per-workflow)
  -- If you want multiple workflows per tenant, change to UNIQUE(tenant_id, workflow_id, webhook_url)
  UNIQUE(tenant_id)
);

-- Index for quick tenant lookup
CREATE INDEX IF NOT EXISTS idx_care_workflow_config_tenant_id 
  ON care_workflow_config(tenant_id);

-- Index for workflow lookup (nullable)
CREATE INDEX IF NOT EXISTS idx_care_workflow_config_workflow_id 
  ON care_workflow_config(workflow_id) WHERE workflow_id IS NOT NULL;

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
COMMENT ON TABLE care_workflow_config IS 'Per-tenant CARE workflow configuration - supports AiSHA workflows or external webhooks';
COMMENT ON COLUMN care_workflow_config.workflow_id IS 'Optional: Reference to AiSHA workflow - used to auto-derive webhook_url';
COMMENT ON COLUMN care_workflow_config.webhook_url IS 'Webhook URL (auto-generated from workflow_id or set manually for external webhooks)';
COMMENT ON COLUMN care_workflow_config.is_enabled IS 'Whether CARE triggers are enabled for this tenant (safe default: false)';
COMMENT ON COLUMN care_workflow_config.state_write_enabled IS 'Whether to persist state transitions to customer_care_state tables';
COMMENT ON COLUMN care_workflow_config.shadow_mode IS 'If true, log decisions but do not execute actions (safe testing mode)';
COMMENT ON COLUMN care_workflow_config.webhook_timeout_ms IS 'HTTP timeout for webhook calls (1-30000ms)';
COMMENT ON COLUMN care_workflow_config.webhook_max_retries IS 'Max retry attempts for failed webhook calls (0-5)';
