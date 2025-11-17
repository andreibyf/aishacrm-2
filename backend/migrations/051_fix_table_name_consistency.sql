-- Migration: Fix Table Name Consistency
-- Created: 2025-11-13
-- Purpose: Clean up orphaned singular table names - plural versions are the correct ones
-- Reference: docs/TENANT_METADATA_AND_TABLE_FIXES.md

-- Issue: Replicated tables exist - both singular and plural versions
-- The plural versions (performance_logs, bizdev_sources) are the correct, active tables
-- The singular versions (performance_log, bizdev_source) are orphaned and should be removed

-- Clean up orphaned performance_log table (if it exists)
DO $$
DECLARE
  singular_exists boolean;
  plural_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_log'
  ) INTO singular_exists;
  
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_logs'
  ) INTO plural_exists;
  
  IF singular_exists AND plural_exists THEN
    RAISE NOTICE 'Found orphaned performance_log table (performance_logs is the correct one)';
    DROP TABLE performance_log CASCADE;
    RAISE NOTICE '✓ Dropped orphaned performance_log table';
  ELSIF singular_exists AND NOT plural_exists THEN
    RAISE WARNING 'Only performance_log exists - should not happen, expected performance_logs';
  ELSIF plural_exists THEN
    RAISE NOTICE '✓ performance_logs exists (correct table)';
  ELSE
    RAISE NOTICE 'Neither performance_log nor performance_logs exists';
  END IF;
END
$$;

-- Clean up orphaned bizdev_source table (if it exists)
DO $$
DECLARE
  singular_exists boolean;
  plural_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bizdev_source'
  ) INTO singular_exists;
  
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bizdev_sources'
  ) INTO plural_exists;
  
  IF singular_exists AND plural_exists THEN
    RAISE NOTICE 'Found orphaned bizdev_source table (bizdev_sources is the correct one)';
    DROP TABLE bizdev_source CASCADE;
    RAISE NOTICE '✓ Dropped orphaned bizdev_source table';
  ELSIF singular_exists AND NOT plural_exists THEN
    RAISE WARNING 'Only bizdev_source exists - should not happen, expected bizdev_sources';
  ELSIF plural_exists THEN
    RAISE NOTICE '✓ bizdev_sources exists (correct table)';
  ELSE
    RAISE NOTICE 'Neither bizdev_source nor bizdev_sources exists';
  END IF;
END
$$;

-- Verify the cleanup was successful
DO $$
DECLARE
  perf_singular_exists boolean;
  perf_plural_exists boolean;
  bizdev_singular_exists boolean;
  bizdev_plural_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_log'
  ) INTO perf_singular_exists;
  
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_logs'
  ) INTO perf_plural_exists;
  
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bizdev_source'
  ) INTO bizdev_singular_exists;
  
  SELECT EXISTS (
    SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bizdev_sources'
  ) INTO bizdev_plural_exists;
  
  RAISE NOTICE '=== Migration Verification ===';
  RAISE NOTICE 'performance_log (orphan): %', perf_singular_exists;
  RAISE NOTICE 'performance_logs (correct): %', perf_plural_exists;
  RAISE NOTICE 'bizdev_source (orphan): %', bizdev_singular_exists;
  RAISE NOTICE 'bizdev_sources (correct): %', bizdev_plural_exists;
  
  IF NOT perf_singular_exists AND perf_plural_exists AND NOT bizdev_singular_exists AND bizdev_plural_exists THEN
    RAISE NOTICE '✅ SUCCESS: All orphaned tables removed, correct plural tables exist';
  ELSIF perf_plural_exists AND bizdev_plural_exists THEN
    RAISE NOTICE '✅ PARTIAL SUCCESS: Correct plural tables exist';
    IF perf_singular_exists THEN
      RAISE WARNING '⚠️  performance_log orphan still exists';
    END IF;
    IF bizdev_singular_exists THEN
      RAISE WARNING '⚠️  bizdev_source orphan still exists';
    END IF;
  ELSE
    RAISE WARNING '⚠️  ATTENTION: Some expected tables are missing';
  END IF;
END
$$;

-- Add comments to document the standardization
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'performance_logs') THEN
    COMMENT ON TABLE performance_logs IS 'Performance metrics logging table (plural is the correct table name)';
  END IF;
  
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'bizdev_sources') THEN
    COMMENT ON TABLE bizdev_sources IS 'Business development source tracking table (plural is the correct table name)';
  END IF;
END
$$;

-- Migration complete
-- This migration is idempotent and safe to run multiple times
-- It only drops orphaned singular tables if plural versions exist
