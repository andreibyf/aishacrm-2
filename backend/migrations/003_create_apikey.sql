-- Migration: create apikey table

CREATE TABLE IF NOT EXISTS apikey (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  key_name TEXT NOT NULL,
  key_value TEXT NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  usage_count INTEGER DEFAULT 0,
  last_used TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_date TIMESTAMPTZ DEFAULT now(),
  created_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_apikey_tenant ON apikey(tenant_id);
