-- Migration: 085_leads_add_ai_columns.sql
-- Purpose: Add AI-related columns to leads table for v2 API
-- Run with: psql $DATABASE_URL -f backend/migrations/085_leads_add_ai_columns.sql

BEGIN;

-- Scoring fields (enhanced from basic score)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score INTEGER CHECK (score >= 0 AND score <= 100);
ALTER TABLE leads ADD COLUMN IF NOT EXISTS score_reason TEXT;

-- AI action recommendation
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_action TEXT DEFAULT 'none'
  CHECK (ai_action IN ('none', 'qualify', 'nurture', 'disqualify', 'convert', 'follow_up'));

-- Lead qualification tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS qualification_status TEXT DEFAULT 'unqualified'
  CHECK (qualification_status IN ('unqualified', 'mql', 'sql', 'sal', 'disqualified'));
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversion_probability DECIMAL(5,4) CHECK (conversion_probability >= 0 AND conversion_probability <= 1);

-- Contact tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS next_action TEXT;

-- Activity metadata (JSON object for engagement tracking)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS activity_metadata JSONB DEFAULT '{}'::jsonb;

-- Address fields (if not already present)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_1 TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS address_2 TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS country TEXT;

-- Tags for categorization
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Unique identifier (auto-generated business ID like LEAD-000001)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- AI document processing flags
ALTER TABLE leads ADD COLUMN IF NOT EXISTS processed_by_ai_doc BOOLEAN DEFAULT FALSE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_doc_source_type TEXT
  CHECK (ai_doc_source_type IS NULL OR ai_doc_source_type IN ('business_card', 'document_extraction', 'web_form', 'import'));

-- Sync tracking
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Legacy/external system integration
ALTER TABLE leads ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- Create indexes for commonly queried AI fields
CREATE INDEX IF NOT EXISTS idx_leads_score ON leads(score) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_ai_action ON leads(ai_action) WHERE ai_action != 'none';
CREATE INDEX IF NOT EXISTS idx_leads_qualification_status ON leads(qualification_status) WHERE qualification_status != 'unqualified';
CREATE INDEX IF NOT EXISTS idx_leads_last_contacted ON leads(last_contacted) WHERE last_contacted IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_unique_id ON leads(unique_id) WHERE unique_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_tags ON leads USING GIN(tags);

COMMIT;

-- Verification query (run manually to confirm)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'leads' 
-- ORDER BY ordinal_position;
