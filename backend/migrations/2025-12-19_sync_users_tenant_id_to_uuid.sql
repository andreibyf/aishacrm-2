-- Migration: Sync users.tenant_id from TEXT to UUID (match dev environment)
-- This migration converts the users table to use UUID tenant_id like dev
--
-- PROD CURRENT STATE:
--   - users.tenant_id is TEXT (contains tenant.tenant_id slug values)
--   - employees.tenant_id is UUID
--
-- DEV STATE (target):
--   - users.tenant_id_text is TEXT (old column renamed)
--   - users.tenant_id is UUID (new column)
--   - employees.tenant_id is UUID
--
-- STEPS:
-- 1. Add status column if missing
-- 2. Rename existing tenant_id (text) to tenant_id_text
-- 3. Add new tenant_id (uuid) column
-- 4. Backfill tenant_id (uuid) from tenant table lookup
-- 5. Add foreign key constraint
-- 6. Add index

-- Step 1: Add status column if it doesn't exist
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Step 2: Rename the old text tenant_id to tenant_id_text (if it's still TEXT)
-- First, check if tenant_id_text already exists to avoid duplicate column error
DO $$
BEGIN
  -- Check if tenant_id column exists and is TEXT type
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'tenant_id'
      AND data_type = 'text'
  ) 
  AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'tenant_id_text'
  ) THEN
    -- Rename tenant_id -> tenant_id_text
    ALTER TABLE public.users RENAME COLUMN tenant_id TO tenant_id_text;
    RAISE NOTICE 'Renamed users.tenant_id (TEXT) to users.tenant_id_text';
  ELSIF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'tenant_id_text'
  ) THEN
    RAISE NOTICE 'users.tenant_id_text already exists, skipping rename';
  END IF;
END $$;

-- Step 3: Add the new tenant_id UUID column (if not already UUID)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'users' 
      AND column_name = 'tenant_id'
      AND data_type = 'uuid'
  ) THEN
    -- tenant_id doesn't exist or is not UUID, add it
    ALTER TABLE public.users ADD COLUMN tenant_id UUID NULL;
    RAISE NOTICE 'Added users.tenant_id (UUID) column';
  ELSE
    RAISE NOTICE 'users.tenant_id (UUID) already exists';
  END IF;
END $$;

-- Step 4: Backfill tenant_id (uuid) from tenant table using tenant_id_text
-- Only for rows that have tenant_id_text set but tenant_id is NULL
UPDATE public.users u
SET tenant_id = t.id
FROM public.tenant t
WHERE u.tenant_id IS NULL
  AND u.tenant_id_text IS NOT NULL
  AND t.tenant_id = u.tenant_id_text;

-- Alternative: If tenant_id_text contains UUIDs directly (as strings), try casting
UPDATE public.users u
SET tenant_id = u.tenant_id_text::uuid
WHERE u.tenant_id IS NULL
  AND u.tenant_id_text IS NOT NULL
  AND u.tenant_id_text ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';

-- Step 5: Add foreign key constraint to tenant table (if not exists)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'users' 
      AND constraint_name = 'users_tenant_id_fkey'
  ) THEN
    ALTER TABLE public.users
    ADD CONSTRAINT users_tenant_id_fkey 
    FOREIGN KEY (tenant_id) REFERENCES public.tenant(id) ON DELETE SET NULL;
    RAISE NOTICE 'Added foreign key constraint users_tenant_id_fkey';
  ELSE
    RAISE NOTICE 'Foreign key users_tenant_id_fkey already exists';
  END IF;
END $$;

-- Step 6: Create index on tenant_id (UUID) for faster lookups
DROP INDEX IF EXISTS idx_users_tenant_id;
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON public.users(tenant_id);

-- Step 7: Add comment for documentation
COMMENT ON COLUMN public.users.tenant_id IS 'Foreign key to tenant(id). NULL for global superadmins.';
COMMENT ON COLUMN public.users.tenant_id_text IS 'DEPRECATED: Legacy text tenant_id, kept for backward compatibility. Use tenant_id (UUID) instead.';

-- Verification query (uncomment to check results)
-- SELECT id, email, role, tenant_id_text, tenant_id 
-- FROM public.users 
-- ORDER BY created_at DESC 
-- LIMIT 10;
