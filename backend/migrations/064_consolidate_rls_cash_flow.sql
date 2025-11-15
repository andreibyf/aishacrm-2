-- Migration: Consolidate RLS policies for cash_flow table
-- Rationale: Replace multiple auth calls with (SELECT auth.*()) subquery
-- to avoid initplan overhead and improve query performance.
-- Schema note: cash_flow has tenant_id (TEXT)

DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='cash_flow' 
      AND policyname='cash_flow_all_consolidated_select'
  ) THEN
    CREATE POLICY cash_flow_all_consolidated_select
      ON public.cash_flow
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
      AND tablename='cash_flow' 
      AND policyname='cash_flow_all_consolidated_insert'
  ) THEN
    CREATE POLICY cash_flow_all_consolidated_insert
      ON public.cash_flow
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
      AND tablename='cash_flow' 
      AND policyname='cash_flow_all_consolidated_update'
  ) THEN
    CREATE POLICY cash_flow_all_consolidated_update
      ON public.cash_flow
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
      AND tablename='cash_flow' 
      AND policyname='cash_flow_all_consolidated_delete'
  ) THEN
    CREATE POLICY cash_flow_all_consolidated_delete
      ON public.cash_flow
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;
