-- Migration: Consolidate RLS policies for leads table
-- Rationale: Replace multiple auth calls with (SELECT auth.*()) subquery
-- to avoid initplan overhead and improve query performance.
-- Schema note: leads has tenant_id (TEXT)

DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='leads' 
      AND policyname='leads_all_consolidated_select'
  ) THEN
    CREATE POLICY leads_all_consolidated_select
      ON public.leads
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
      AND tablename='leads' 
      AND policyname='leads_all_consolidated_insert'
  ) THEN
    CREATE POLICY leads_all_consolidated_insert
      ON public.leads
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
      AND tablename='leads' 
      AND policyname='leads_all_consolidated_update'
  ) THEN
    CREATE POLICY leads_all_consolidated_update
      ON public.leads
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
      AND tablename='leads' 
      AND policyname='leads_all_consolidated_delete'
  ) THEN
    CREATE POLICY leads_all_consolidated_delete
      ON public.leads
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;
