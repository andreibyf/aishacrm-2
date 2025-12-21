-- Flatten activities table: move commonly used fields from metadata to direct columns

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS due_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to UUID,
  ADD COLUMN IF NOT EXISTS description TEXT;

-- Add indexes for frequently queried fields
CREATE INDEX IF NOT EXISTS idx_activities_due_date ON activities(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_priority ON activities(priority) WHERE priority IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(assigned_to) WHERE assigned_to IS NOT NULL;
