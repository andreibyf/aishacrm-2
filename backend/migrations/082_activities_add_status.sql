-- Add status column to activities table
-- This column exists in production but is missing from DEV
-- Common status values: 'pending', 'in_progress', 'completed', 'cancelled'

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';

-- Add index for status filtering
CREATE INDEX IF NOT EXISTS idx_activities_status 
  ON activities(status) 
  WHERE status IS NOT NULL;

-- Comment for documentation
COMMENT ON COLUMN activities.status IS 'Activity completion status: pending, in_progress, completed, cancelled';
