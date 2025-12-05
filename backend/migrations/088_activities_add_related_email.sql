-- 088_activities_add_related_email.sql
-- Add related_email column to activities table for denormalized contact/lead email
-- Safe to run repeatedly (guarded with IF NOT EXISTS)

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS related_email TEXT;

-- Index for lookups by related email
CREATE INDEX IF NOT EXISTS idx_activities_related_email 
  ON activities(tenant_id, related_email) 
  WHERE related_email IS NOT NULL;

-- Backfill from metadata if exists
UPDATE activities
SET related_email = metadata ->> 'related_email'
WHERE related_email IS NULL
  AND metadata ? 'related_email'
  AND (metadata ->> 'related_email') IS NOT NULL
  AND (metadata ->> 'related_email') <> '';

-- Cleanup: Remove from metadata after migration
UPDATE activities
SET metadata = metadata - 'related_email'
WHERE metadata ? 'related_email';
