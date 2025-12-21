-- Migration: 087_activities_add_ai_columns.sql
-- Purpose: Add AI-related columns to activities table for v2 API
-- Run with: psql $DATABASE_URL -f backend/migrations/087_activities_add_ai_columns.sql

BEGIN;

-- AI priority and urgency
ALTER TABLE activities ADD COLUMN IF NOT EXISTS ai_priority TEXT DEFAULT 'normal'
  CHECK (ai_priority IN ('low', 'normal', 'high', 'urgent', 'critical'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS urgency_score INTEGER CHECK (urgency_score >= 0 AND urgency_score <= 100);

-- AI action recommendation
ALTER TABLE activities ADD COLUMN IF NOT EXISTS ai_action TEXT DEFAULT 'none'
  CHECK (ai_action IN ('none', 'complete', 'reschedule', 'delegate', 'escalate', 'cancel'));

-- Sentiment and outcome (for calls/emails)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS sentiment TEXT
  CHECK (sentiment IS NULL OR sentiment IN ('positive', 'neutral', 'negative', 'mixed'));
ALTER TABLE activities ADD COLUMN IF NOT EXISTS outcome TEXT
  CHECK (outcome IS NULL OR outcome IN ('successful', 'unsuccessful', 'follow_up_needed', 'no_answer', 'voicemail', 'rescheduled'));

-- AI-generated summary
ALTER TABLE activities ADD COLUMN IF NOT EXISTS ai_summary TEXT;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS key_points JSONB DEFAULT '[]'::jsonb;

-- Activity metadata (JSON object for AI context)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS activity_metadata JSONB DEFAULT '{}'::jsonb;

-- Tags for categorization
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Unique identifier (auto-generated business ID like ACT-000001)
ALTER TABLE activities ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- AI document processing flags
ALTER TABLE activities ADD COLUMN IF NOT EXISTS processed_by_ai_doc BOOLEAN DEFAULT FALSE;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS ai_doc_source_type TEXT
  CHECK (ai_doc_source_type IS NULL OR ai_doc_source_type IN ('call_transcript', 'email', 'meeting_notes'));

-- Sync tracking
ALTER TABLE activities ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Legacy/external system integration
ALTER TABLE activities ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- Create indexes for commonly queried AI fields
CREATE INDEX IF NOT EXISTS idx_activities_ai_priority ON activities(ai_priority) WHERE ai_priority != 'normal';
CREATE INDEX IF NOT EXISTS idx_activities_urgency_score ON activities(urgency_score) WHERE urgency_score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_ai_action ON activities(ai_action) WHERE ai_action != 'none';
CREATE INDEX IF NOT EXISTS idx_activities_sentiment ON activities(sentiment) WHERE sentiment IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_outcome ON activities(outcome) WHERE outcome IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_unique_id ON activities(unique_id) WHERE unique_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_tags ON activities USING GIN(tags);

COMMIT;

-- Verification query (run manually to confirm)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'activities' 
-- ORDER BY ordinal_position;
