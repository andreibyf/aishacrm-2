-- Migration: Consolidate RLS policies for conversations table
-- Rationale: Replace multiple auth.uid() calls with (SELECT auth.uid()) subquery
-- to avoid initplan overhead and improve query performance.
-- Reference: Supabase auth_rls_initplan optimization guidance
-- Schema note: conversations has tenant_id (UUID) but no user ownership columns

-- Note: This migration uses DO blocks to check for existing policies.
-- Run outside a transaction if applying manually with CONCURRENTLY operations.

DO $$
BEGIN
  -- Read policy (tenant-only, no user ownership column)
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_read_consolidated'
  ) THEN
    CREATE POLICY conversations_read_consolidated
      ON public.conversations
      FOR SELECT
      TO authenticated
      USING (
        -- Allow if tenant matches JWT claim
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      );
  END IF;

  -- Insert policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_insert_consolidated'
  ) THEN
    CREATE POLICY conversations_insert_consolidated
      ON public.conversations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        -- Must match tenant
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      );
  END IF;

  -- Update policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_update_consolidated'
  ) THEN
    CREATE POLICY conversations_update_consolidated
      ON public.conversations
      FOR UPDATE
      TO authenticated
      USING (
        -- Can update any conversation in tenant
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      )
      WITH CHECK (
        -- Cannot change tenant
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      );
  END IF;

  -- Delete policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_delete_consolidated'
  ) THEN
    CREATE POLICY conversations_delete_consolidated
      ON public.conversations
      FOR DELETE
      TO authenticated
      USING (
        -- Can delete any conversation in tenant
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      );
  END IF;
END$$;

-- Optional: Drop old unconsolidated policies if they exist
-- Uncomment these after verifying the new policies work correctly:
-- DROP POLICY IF EXISTS old_conversations_select_policy ON public.conversations;
-- DROP POLICY IF EXISTS old_conversations_insert_policy ON public.conversations;
-- DROP POLICY IF EXISTS old_conversations_update_policy ON public.conversations;
-- DROP POLICY IF EXISTS old_conversations_delete_policy ON public.conversations;
