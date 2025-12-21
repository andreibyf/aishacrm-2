-- Migration 095: Entity Labels
-- Allow superadmin to customize entity display names per tenant
-- E.g., "Leads" → "Prospects", "Accounts" → "Companies"

CREATE TABLE IF NOT EXISTS entity_labels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  entity_key TEXT NOT NULL,
  custom_label TEXT NOT NULL,
  custom_label_singular TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, entity_key)
);

-- Index for fast lookups by tenant
CREATE INDEX IF NOT EXISTS idx_entity_labels_tenant_id ON entity_labels(tenant_id);

-- Comment for documentation
COMMENT ON TABLE entity_labels IS 'Custom display names for CRM entities per tenant. Superadmin-managed.';
COMMENT ON COLUMN entity_labels.entity_key IS 'System entity identifier: leads, contacts, accounts, opportunities, activities, bizdev_sources';
COMMENT ON COLUMN entity_labels.custom_label IS 'Custom plural display name (e.g., Prospects instead of Leads)';
COMMENT ON COLUMN entity_labels.custom_label_singular IS 'Custom singular display name (e.g., Prospect instead of Lead)';

-- RLS policies
ALTER TABLE entity_labels ENABLE ROW LEVEL SECURITY;

-- Allow read for authenticated users in the same tenant
CREATE POLICY entity_labels_select_policy ON entity_labels
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_uuid FROM users WHERE id = auth.uid()
    )
  );

-- Allow all operations for service role (backend)
CREATE POLICY entity_labels_service_policy ON entity_labels
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
