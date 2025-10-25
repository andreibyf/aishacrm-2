-- Extend activities with additional first-class fields used by the frontend
-- Safe to run multiple times due to IF NOT EXISTS

ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS created_by TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT,
  ADD COLUMN IF NOT EXISTS due_date DATE,
  ADD COLUMN IF NOT EXISTS due_time TEXT,
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS related_to TEXT,
  ADD COLUMN IF NOT EXISTS updated_date TIMESTAMPTZ;

-- Ensure created_date exists (added by 002_add_created_date.sql, but keep idempotent)
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;

-- Helpful indexes for common queries
CREATE INDEX IF NOT EXISTS idx_activities_created_date ON activities(tenant_id, created_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_updated_date ON activities(tenant_id, updated_date DESC);
CREATE INDEX IF NOT EXISTS idx_activities_created_by ON activities(tenant_id, created_by);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(tenant_id, assigned_to);
