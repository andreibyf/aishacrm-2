-- Migration: 103_status_card_preferences.sql
-- Description: Create status_card_preferences table for AI context dictionary
-- This allows per-tenant customization of status cards that AI can reference
-- Part of v3.0.0 tenant context dictionary system

-- Create status_card_preferences table
CREATE TABLE IF NOT EXISTS status_card_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL, -- contacts, accounts, leads, opportunities, activities, bizdev_sources
  card_id TEXT NOT NULL,     -- e.g., 'active', 'prospect', 'new', etc.
  custom_label TEXT,         -- custom display label for the card
  visible BOOLEAN DEFAULT true,
  sort_order INTEGER DEFAULT 0,
  color TEXT,                -- optional custom color
  icon TEXT,                 -- optional custom icon
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  -- Ensure unique combination of tenant + entity + card
  CONSTRAINT status_card_preferences_unique UNIQUE (tenant_id, entity_type, card_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_status_card_prefs_tenant_id ON status_card_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_status_card_prefs_entity_type ON status_card_preferences(entity_type);
CREATE INDEX IF NOT EXISTS idx_status_card_prefs_tenant_entity ON status_card_preferences(tenant_id, entity_type);

-- Enable RLS
ALTER TABLE status_card_preferences ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only access their own tenant's status card preferences
CREATE POLICY status_card_preferences_tenant_isolation ON status_card_preferences
  FOR ALL
  TO authenticated
  USING (tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid()));

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON status_card_preferences TO authenticated;
GRANT SELECT ON status_card_preferences TO anon;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_status_card_prefs_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_status_card_prefs_updated_at ON status_card_preferences;
CREATE TRIGGER trigger_status_card_prefs_updated_at
  BEFORE UPDATE ON status_card_preferences
  FOR EACH ROW
  EXECUTE FUNCTION update_status_card_prefs_updated_at();

-- Add comment for documentation
COMMENT ON TABLE status_card_preferences IS 'Per-tenant status card customizations for AI context dictionary (v3.0.0)';
COMMENT ON COLUMN status_card_preferences.entity_type IS 'Entity type: contacts, accounts, leads, opportunities, activities, bizdev_sources';
COMMENT ON COLUMN status_card_preferences.card_id IS 'Unique identifier for the status card within the entity type';
COMMENT ON COLUMN status_card_preferences.custom_label IS 'Custom display label overriding the default';
