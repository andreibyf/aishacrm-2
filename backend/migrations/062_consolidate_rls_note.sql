-- Migration: Consolidate RLS policies for note table
-- Rationale: Replace multiple auth calls with (SELECT auth.*()) subquery
-- to avoid initplan overhead and improve query performance.
-- Schema note: note has tenant_id (TEXT) and created_by (TEXT)

DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='note' 
      AND policyname='note_all_consolidated_select'
  ) THEN
    CREATE POLICY note_all_consolidated_select
      ON public.note
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
      AND tablename='note' 
      AND policyname='note_all_consolidated_insert'
  ) THEN
    CREATE POLICY note_all_consolidated_insert
      ON public.note
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
      AND tablename='note' 
      AND policyname='note_all_consolidated_update'
  ) THEN
    CREATE POLICY note_all_consolidated_update
      ON public.note
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
      AND tablename='note' 
      AND policyname='note_all_consolidated_delete'
  ) THEN
    CREATE POLICY note_all_consolidated_delete
      ON public.note
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;
