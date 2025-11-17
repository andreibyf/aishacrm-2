-- Migration: Drop old unconsolidated RLS policies after validation
-- Run this after confirming the new consolidated policies work correctly
-- This removes redundant policies that cause auth_rls_initplan overhead

DO $$
DECLARE
  pol_record RECORD;
  drop_count INTEGER := 0;
BEGIN
  -- Drop old tenant_isolation policies from migration 023
  FOR pol_record IN 
    SELECT tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND policyname LIKE 'tenant_isolation_%'
      AND tablename IN (
        'accounts', 'activities', 'contacts', 'leads', 'opportunities',
        'notifications', 'note', 'client_requirement', 'cash_flow',
        'workflow', 'workflow_execution', 'synchealth'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_record.policyname, pol_record.tablename);
    drop_count := drop_count + 1;
    RAISE NOTICE 'Dropped policy % on table %', pol_record.policyname, pol_record.tablename;
  END LOOP;

  -- Drop any old separate SELECT/INSERT/UPDATE/DELETE policies
  FOR pol_record IN 
    SELECT tablename, policyname 
    FROM pg_policies 
    WHERE schemaname = 'public' 
      AND tablename IN (
        'conversations', 'conversation_messages', 'accounts', 'activities', 
        'contacts', 'leads', 'opportunities', 'notifications', 'note', 
        'client_requirement', 'cash_flow', 'workflow', 'workflow_execution', 'synchealth'
      )
      AND policyname NOT LIKE '%_consolidated_%'
      AND policyname NOT LIKE 'service_role_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol_record.policyname, pol_record.tablename);
    drop_count := drop_count + 1;
    RAISE NOTICE 'Dropped policy % on table %', pol_record.policyname, pol_record.tablename;
  END LOOP;

  RAISE NOTICE 'Total policies dropped: %', drop_count;
END$$;
