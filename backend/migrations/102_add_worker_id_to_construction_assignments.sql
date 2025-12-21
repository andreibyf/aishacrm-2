-- Migration 102: Add worker_id to construction_assignments
-- Adds worker_id column to properly reference workers table instead of contacts

DO $$
BEGIN
  -- Add worker_id column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'construction_assignments' AND column_name = 'worker_id'
  ) THEN
    ALTER TABLE construction_assignments ADD COLUMN worker_id UUID REFERENCES workers(id) ON DELETE CASCADE;
    CREATE INDEX IF NOT EXISTS idx_construction_assignments_worker_id ON construction_assignments(worker_id);
    RAISE NOTICE 'Added worker_id column to construction_assignments table';
  ELSE
    RAISE NOTICE 'worker_id column already exists in construction_assignments table';
  END IF;
END $$;

-- Update unique constraint to use worker_id instead of contact_id
-- Drop old constraint if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'construction_assignments_project_id_contact_id_role_key'
  ) THEN
    ALTER TABLE construction_assignments DROP CONSTRAINT construction_assignments_project_id_contact_id_role_key;
    RAISE NOTICE 'Dropped old unique constraint on project_id, contact_id, role';
  END IF;
END $$;

-- Add new unique constraint with worker_id
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'construction_assignments_project_id_worker_id_role_key'
  ) THEN
    ALTER TABLE construction_assignments ADD CONSTRAINT construction_assignments_project_id_worker_id_role_key 
      UNIQUE(project_id, worker_id, role);
    RAISE NOTICE 'Added unique constraint on project_id, worker_id, role';
  END IF;
END $$;

-- Comment
COMMENT ON COLUMN construction_assignments.worker_id IS 'FK to workers table - the assigned worker (replaces contact_id)';
