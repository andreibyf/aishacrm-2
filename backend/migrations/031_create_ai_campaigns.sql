-- 031_create_ai_campaigns.sql
-- Creates ai_campaigns table to back AI Campaigns feature
-- Includes minimal indexes; RLS left disabled initially (mirrors other tables pattern)

CREATE TABLE IF NOT EXISTS ai_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft', -- draft|scheduled|running|paused|completed|cancelled
    description TEXT,
    target_contacts JSONB DEFAULT '[]'::jsonb, -- array of target contact objects
    performance_metrics JSONB DEFAULT '{}'::jsonb, -- aggregated metrics
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Basic indexes
CREATE INDEX IF NOT EXISTS idx_ai_campaigns_tenant ON ai_campaigns(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_campaigns_status ON ai_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_ai_campaigns_tenant_status ON ai_campaigns(tenant_id, status);

-- Trigger to keep updated_at current
CREATE OR REPLACE FUNCTION ai_campaigns_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_ai_campaigns_updated_at ON ai_campaigns;
CREATE TRIGGER trg_ai_campaigns_updated_at
BEFORE UPDATE ON ai_campaigns
FOR EACH ROW EXECUTE FUNCTION ai_campaigns_set_updated_at();

-- (Optional) RLS policies could be added later similar to opportunities
-- ALTER TABLE ai_campaigns ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY ai_campaigns_tenant_isolation ON ai_campaigns USING (tenant_id = current_setting('app.tenant_id', true));

-- Migration metadata insert (if you track applied migrations in a table)
-- INSERT INTO migration_history (id, name, applied_at) VALUES (31, '031_create_ai_campaigns.sql', NOW());
