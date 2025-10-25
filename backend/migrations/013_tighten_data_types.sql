-- Tighten data types for better validation and performance
-- Safe to run multiple times

-- Create ENUM type for activity priority
DO $$ BEGIN
  CREATE TYPE activity_priority AS ENUM ('low', 'normal', 'high', 'urgent');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Convert existing priority column to use ENUM
-- First, set any NULL or invalid values to 'normal'
UPDATE activities 
SET priority = 'normal' 
WHERE priority IS NULL 
   OR priority NOT IN ('low', 'normal', 'high', 'urgent');

-- Convert the column type
ALTER TABLE activities 
  ALTER COLUMN priority TYPE activity_priority USING priority::activity_priority,
  ALTER COLUMN priority SET DEFAULT 'normal'::activity_priority,
  ALTER COLUMN priority SET NOT NULL;

-- Convert due_time from TEXT to TIME type for better validation
-- First ensure all due_time values are valid HH:MM format or NULL
UPDATE activities
SET due_time = NULL
WHERE due_time IS NOT NULL 
  AND due_time !~ '^\d{2}:\d{2}(:\d{2})?$';

-- Convert to TIME type
ALTER TABLE activities
  ALTER COLUMN due_time TYPE TIME USING 
    CASE 
      WHEN due_time IS NULL THEN NULL
      WHEN due_time ~ '^\d{2}:\d{2}$' THEN (due_time || ':00')::TIME
      ELSE due_time::TIME
    END;

-- Create indexes on new typed columns
CREATE INDEX IF NOT EXISTS idx_activities_priority ON activities(tenant_id, priority) WHERE priority IN ('high', 'urgent');
CREATE INDEX IF NOT EXISTS idx_activities_due_date ON activities(tenant_id, due_date) WHERE due_date IS NOT NULL;

COMMENT ON COLUMN activities.priority IS 'Activity priority level: low, normal, high, or urgent';
COMMENT ON COLUMN activities.due_time IS 'Time component of due date in HH:MM:SS format';
