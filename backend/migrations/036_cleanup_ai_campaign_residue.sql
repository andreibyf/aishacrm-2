-- =============================================================
-- Migration 036: Cleanup ai_campaign residue (hardening)
-- Ensures any lingering references to the legacy ai_campaign table
-- are removed, preventing accidental resurrection or migration conflicts.
--
-- This is a hardening step after migration 035 consolidated ai_campaign
-- into ai_campaigns (plural). Safe to run multiple times.
-- =============================================================

BEGIN;

-- 1. Drop any lingering RLS policies on ai_campaign (if table was recreated accidentally)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' AND tablename = 'ai_campaign'
  ) THEN
    RAISE NOTICE 'Dropping stray RLS policies on ai_campaign';
    DROP POLICY IF EXISTS "Service role full access to ai_campaign" ON ai_campaign;
    -- Add any other known policy names here if needed
  END IF;
END$$;

-- 2. Drop any indexes on ai_campaign
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'idx_ai_campaign_tenant') THEN
    RAISE NOTICE 'Dropping stray index idx_ai_campaign_tenant';
    DROP INDEX IF EXISTS idx_ai_campaign_tenant;
  END IF;
END$$;

-- 3. Drop the ai_campaign table entirely (CASCADE to remove constraints/dependencies)
DO $$
BEGIN
  IF EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ai_campaign'
  ) THEN
    RAISE NOTICE 'Dropping legacy ai_campaign table';
    DROP TABLE ai_campaign CASCADE;
  ELSE
    RAISE NOTICE 'ai_campaign table does not exist (expected after migration 035)';
  END IF;
END$$;

COMMIT;

-- =============================================================
-- Post-migration verification:
-- Confirm ai_campaign table and related objects are gone:
--
-- SELECT tablename FROM pg_tables WHERE tablename = 'ai_campaign';
-- (Should return 0 rows)
--
-- SELECT indexname FROM pg_indexes WHERE indexname LIKE '%ai_campaign%';
-- (Should return 0 rows)
--
-- SELECT policyname FROM pg_policies WHERE tablename = 'ai_campaign';
-- (Should return 0 rows)
-- =============================================================
