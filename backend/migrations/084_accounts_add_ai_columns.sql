-- Migration: 084_accounts_add_ai_columns.sql
-- Purpose: Add AI-related columns to accounts table for v2 API
-- Run with: psql $DATABASE_URL -f backend/migrations/084_accounts_add_ai_columns.sql

BEGIN;

-- Scoring fields
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS score INTEGER CHECK (score >= 0 AND score <= 100);
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS score_reason TEXT;

-- AI action recommendation
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_action TEXT DEFAULT 'none'
  CHECK (ai_action IN ('none', 'follow_up', 'nurture', 'upsell', 'at_risk', 'renew'));

-- Account health tracking
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS health_status TEXT DEFAULT 'unknown'
  CHECK (health_status IN ('unknown', 'healthy', 'at_risk', 'churning', 'new'));
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_activity_date DATE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS next_action TEXT;

-- Activity metadata (JSON object for engagement tracking)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS activity_metadata JSONB DEFAULT '{}'::jsonb;

-- Tags for categorization
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Unique identifier (auto-generated business ID like ACCT-000001)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- AI document processing flags
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS processed_by_ai_doc BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS ai_doc_source_type TEXT
  CHECK (ai_doc_source_type IS NULL OR ai_doc_source_type IN ('business_card', 'document_extraction', 'web_scrape'));

-- Sync tracking
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Legacy/external system integration
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- Create indexes for commonly queried AI fields
CREATE INDEX IF NOT EXISTS idx_accounts_score ON accounts(score) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_ai_action ON accounts(ai_action) WHERE ai_action != 'none';
CREATE INDEX IF NOT EXISTS idx_accounts_health_status ON accounts(health_status) WHERE health_status != 'unknown';
CREATE INDEX IF NOT EXISTS idx_accounts_last_activity_date ON accounts(last_activity_date) WHERE last_activity_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_unique_id ON accounts(unique_id) WHERE unique_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_accounts_tags ON accounts USING GIN(tags);

COMMIT;

-- Verification query (run manually to confirm)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'accounts' 
-- ORDER BY ordinal_position;
