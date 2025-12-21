-- Migration: Consolidate RLS policies for workflow_execution table
-- Rationale: Replace multiple auth calls with (SELECT auth.*()) subquery
-- to avoid initplan overhead and improve query performance.
-- Schema note: workflow_execution has tenant_id (TEXT)

DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='workflow_execution' 
      AND policyname='workflow_execution_all_consolidated_select'
  ) THEN
    CREATE POLICY workflow_execution_all_consolidated_select
      ON public.workflow_execution
      FOR SELECT
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='workflow_execution' 
      AND policyname='workflow_execution_all_consolidated_insert'
  ) THEN
    CREATE POLICY workflow_execution_all_consolidated_insert
      ON public.workflow_execution
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
      AND tablename='workflow_execution' 
      AND policyname='workflow_execution_all_consolidated_update'
  ) THEN
    CREATE POLICY workflow_execution_all_consolidated_update
      ON public.workflow_execution
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
      AND tablename='workflow_execution' 
      AND policyname='workflow_execution_all_consolidated_delete'
  ) THEN
    CREATE POLICY workflow_execution_all_consolidated_delete
      ON public.workflow_execution
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;
