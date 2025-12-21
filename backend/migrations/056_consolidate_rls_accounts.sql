-- Migration: Consolidate RLS policies for accounts table
-- Rationale: Replace multiple auth calls with (SELECT auth.*()) subquery
-- to avoid initplan overhead and improve query performance.
-- Reference: Supabase auth_rls_initplan optimization guidance
-- Schema note: accounts has tenant_id (TEXT) not UUID

DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='accounts' 
      AND policyname='accounts_all_consolidated_select'
  ) THEN
    CREATE POLICY accounts_all_consolidated_select
      ON public.accounts
      FOR SELECT
      TO authenticated
      USING (
        -- Allow if tenant matches JWT claim or service_role
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='accounts' 
      AND policyname='accounts_all_consolidated_insert'
  ) THEN
    CREATE POLICY accounts_all_consolidated_insert
      ON public.accounts
      FOR INSERT
      TO authenticated
      WITH CHECK (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='accounts' 
      AND policyname='accounts_all_consolidated_update'
  ) THEN
    CREATE POLICY accounts_all_consolidated_update
      ON public.accounts
      FOR UPDATE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      )
      WITH CHECK (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='accounts' 
      AND policyname='accounts_all_consolidated_delete'
  ) THEN
    CREATE POLICY accounts_all_consolidated_delete
      ON public.accounts
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;

-- Optional: Drop old unconsolidated policies after verifying the new ones work
-- Uncomment these after validation:
-- DROP POLICY IF EXISTS tenant_isolation_accounts ON public.accounts;
-- DROP POLICY IF EXISTS old_accounts_select_policy ON public.accounts;
-- DROP POLICY IF EXISTS old_accounts_insert_policy ON public.accounts;
-- DROP POLICY IF EXISTS old_accounts_update_policy ON public.accounts;
-- DROP POLICY IF EXISTS old_accounts_delete_policy ON public.accounts;
