-- 092_activities_add_related_name.sql
-- Add related_name column to activities table for denormalized contact/lead name
-- Safe to run repeatedly (guarded with IF NOT EXISTS)

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS related_name TEXT;

-- Index for lookups by related name
CREATE INDEX IF NOT EXISTS idx_activities_related_name 
  ON activities(tenant_id, related_name) 
  WHERE related_name IS NOT NULL;

-- Backfill from metadata if exists
UPDATE activities
SET related_name = metadata ->> 'related_name'
WHERE related_name IS NULL
  AND metadata ? 'related_name'
  AND (metadata ->> 'related_name') IS NOT NULL
  AND (metadata ->> 'related_name') <> '';

-- Cleanup: Remove from metadata after migration
UPDATE activities
SET metadata = metadata - 'related_name'
WHERE metadata ? 'related_name';
