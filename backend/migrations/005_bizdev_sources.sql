-- Migration: 005_bizdev_sources
-- Create bizdev_sources table for business development lead sources

CREATE TABLE IF NOT EXISTS bizdev_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  
  -- Source Information
  source_name TEXT NOT NULL,
  source_type TEXT, -- e.g., 'referral', 'marketing', 'cold_outreach', 'partnership'
  source_url TEXT,
  contact_person TEXT,
  contact_email TEXT,
  contact_phone TEXT,
  
  -- Status & Priority
  status TEXT DEFAULT 'active', -- 'active', 'inactive', 'archived'
  priority TEXT DEFAULT 'medium', -- 'low', 'medium', 'high'
  
  -- Metrics
  leads_generated INTEGER DEFAULT 0,
  opportunities_created INTEGER DEFAULT 0,
  revenue_generated DECIMAL(15, 2) DEFAULT 0,
  
  -- Notes & Metadata
  notes TEXT,
  tags JSONB DEFAULT '[]'::jsonb,
  metadata JSONB DEFAULT '{}'::jsonb,
  
  -- Test data flag
  is_test_data BOOLEAN DEFAULT false,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_bizdev_sources_tenant ON bizdev_sources(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bizdev_sources_status ON bizdev_sources(status);
CREATE INDEX IF NOT EXISTS idx_bizdev_sources_type ON bizdev_sources(source_type);
CREATE INDEX IF NOT EXISTS idx_bizdev_sources_priority ON bizdev_sources(priority);

-- Trigger to sync created_date with created_at
CREATE OR REPLACE FUNCTION sync_bizdev_sources_created_date()
RETURNS TRIGGER AS $$
BEGIN
  NEW.created_date = NEW.created_at;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_sync_bizdev_sources_created_date
BEFORE INSERT OR UPDATE ON bizdev_sources
FOR EACH ROW
EXECUTE FUNCTION sync_bizdev_sources_created_date();
