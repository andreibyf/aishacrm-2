-- 093_activities_created_date_default.sql
-- Ensure created_date has a default value and backfill null values
-- Safe to run repeatedly

-- Add default to created_date column
ALTER TABLE activities
  ALTER COLUMN created_date SET DEFAULT NOW();

-- Backfill any activities with null created_date using created_at
UPDATE activities
SET created_date = COALESCE(created_at, NOW())
WHERE created_date IS NULL;
