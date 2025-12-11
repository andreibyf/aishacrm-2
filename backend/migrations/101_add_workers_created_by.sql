-- Migration 101: Add created_by to workers table if missing
-- Fixes issue where workers table exists but created_by column is missing

DO $$
BEGIN
  -- Add created_by column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'workers' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE workers ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added created_by column to workers table';
  ELSE
    RAISE NOTICE 'created_by column already exists in workers table';
  END IF;
END $$;
