-- Migration: 086_opportunities_add_ai_columns.sql
-- Purpose: Add AI-related columns to opportunities table for v2 API
-- Run with: psql $DATABASE_URL -f backend/migrations/086_opportunities_add_ai_columns.sql

BEGIN;

-- AI deal health and predictions
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_health TEXT DEFAULT 'unknown'
  CHECK (ai_health IN ('unknown', 'healthy', 'at_risk', 'stalled', 'closing'));
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS win_probability DECIMAL(5,4) CHECK (win_probability >= 0 AND win_probability <= 1);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS risk_factors JSONB DEFAULT '[]'::jsonb;

-- AI action recommendation
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_action TEXT DEFAULT 'none'
  CHECK (ai_action IN ('none', 'follow_up', 'negotiate', 'close', 'nurture', 'escalate', 'rescue'));

-- Scoring fields
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score INTEGER CHECK (score >= 0 AND score <= 100);
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS score_reason TEXT;

-- Activity tracking
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_activity_date DATE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS next_action TEXT;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS days_in_stage INTEGER DEFAULT 0;

-- Activity metadata (JSON object for engagement tracking)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS activity_metadata JSONB DEFAULT '{}'::jsonb;

-- Competitor tracking
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS competitors JSONB DEFAULT '[]'::jsonb;

-- Tags for categorization
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Unique identifier (auto-generated business ID like OPP-000001)
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- AI document processing flags
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS processed_by_ai_doc BOOLEAN DEFAULT FALSE;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS ai_doc_source_type TEXT
  CHECK (ai_doc_source_type IS NULL OR ai_doc_source_type IN ('proposal', 'contract', 'email_thread'));

-- Sync tracking
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Legacy/external system integration
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- Create indexes for commonly queried AI fields
CREATE INDEX IF NOT EXISTS idx_opportunities_ai_health ON opportunities(ai_health) WHERE ai_health != 'unknown';
CREATE INDEX IF NOT EXISTS idx_opportunities_win_probability ON opportunities(win_probability) WHERE win_probability IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_score ON opportunities(score) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_ai_action ON opportunities(ai_action) WHERE ai_action != 'none';
CREATE INDEX IF NOT EXISTS idx_opportunities_last_activity_date ON opportunities(last_activity_date) WHERE last_activity_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_unique_id ON opportunities(unique_id) WHERE unique_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_opportunities_tags ON opportunities USING GIN(tags);

COMMIT;

-- Verification query (run manually to confirm)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'opportunities' 
-- ORDER BY ordinal_position;
