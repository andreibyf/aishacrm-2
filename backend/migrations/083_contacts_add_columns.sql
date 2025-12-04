-- Migration: 083_contacts_add_columns.sql
-- Purpose: Add missing columns to contacts table to align with Contact entity schema
-- These columns support the v2 Contacts API with flattened metadata
-- Run with: psql $DATABASE_URL -f backend/migrations/083_contacts_add_columns.sql

BEGIN;

-- Mobile phone (separate from main phone)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mobile TEXT;

-- Lead source tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source TEXT;

-- Address fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_1 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS address_2 TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS state TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;

-- Tags for categorization (JSON array)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb;

-- Unique identifier (auto-generated business ID like CONT-000001)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- Denormalized fields for faster display
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_industry TEXT;

-- Notes field (longer form notes vs description)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;

-- Scoring fields
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score INTEGER CHECK (score >= 0 AND score <= 100);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS score_reason TEXT;

-- AI action recommendation
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_action TEXT DEFAULT 'none'
  CHECK (ai_action IN ('none', 'follow_up', 'nurture', 'qualify', 'disqualify'));

-- Contact tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_contacted DATE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_action TEXT;

-- Activity metadata (JSON object for engagement tracking)
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS activity_metadata JSONB DEFAULT '{}'::jsonb;

-- Legacy/external system integration
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS legacy_id TEXT;

-- AI document processing flags
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS processed_by_ai_doc BOOLEAN DEFAULT FALSE;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ai_doc_source_type TEXT
  CHECK (ai_doc_source_type IS NULL OR ai_doc_source_type IN ('business_card', 'document_extraction'));

-- Sync tracking
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_synced TIMESTAMPTZ;

-- Create indexes for commonly queried fields
CREATE INDEX IF NOT EXISTS idx_contacts_lead_source ON contacts(lead_source) WHERE lead_source IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_state ON contacts(state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_unique_id ON contacts(unique_id) WHERE unique_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_score ON contacts(score) WHERE score IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_ai_action ON contacts(ai_action) WHERE ai_action != 'none';
CREATE INDEX IF NOT EXISTS idx_contacts_last_contacted ON contacts(last_contacted) WHERE last_contacted IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_tags ON contacts USING GIN(tags);

COMMIT;

-- Verification query (run manually to confirm)
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'contacts' 
-- ORDER BY ordinal_position;
