-- Migration 113: Fix Activities RLS Policies for UUID tenant_id
-- ==================================================================
-- Problem: Migration 057 created RLS policies assuming tenant_id is TEXT
--          but activities.tenant_id is actually UUID (changed in migration 081+)
--          This causes ALL RLS checks to fail because UUID ≠ TEXT in PostgreSQL
-- 
-- Symptom: 404 errors on DELETE /api/v2/activities/:id even though record exists
--          Backend uses service_role key so bypasses RLS, but any JWT auth fails
-- 
-- Solution: Drop and recreate policies with proper UUID casting
--           Pattern: tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
-- 
-- Reference: See migration 055 (conversations) for correct UUID RLS pattern

DO $$
BEGIN
  -- Drop all existing consolidated policies (if they exist)
  DROP POLICY IF EXISTS activities_all_consolidated_select ON public.activities;
  DROP POLICY IF EXISTS activities_all_consolidated_insert ON public.activities;
  DROP POLICY IF EXISTS activities_all_consolidated_update ON public.activities;
  DROP POLICY IF EXISTS activities_all_consolidated_delete ON public.activities;

  -- SELECT policy (with UUID casting)
  CREATE POLICY activities_all_consolidated_select
    ON public.activities
    FOR SELECT
    TO authenticated
    USING (
      tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      OR (SELECT auth.role()) = 'service_role'
    );

  -- INSERT policy (with UUID casting)
  CREATE POLICY activities_all_consolidated_insert
    ON public.activities
    FOR INSERT
    TO authenticated
    WITH CHECK (
      tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      OR (SELECT auth.role()) = 'service_role'
    );

  -- UPDATE policy (with UUID casting)
  CREATE POLICY activities_all_consolidated_update
    ON public.activities
    FOR UPDATE
    TO authenticated
    USING (
      tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      OR (SELECT auth.role()) = 'service_role'
    )
    WITH CHECK (
      tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      OR (SELECT auth.role()) = 'service_role'
    );

  -- DELETE policy (with UUID casting)
  CREATE POLICY activities_all_consolidated_delete
    ON public.activities
    FOR DELETE
    TO authenticated
    USING (
      tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
      OR (SELECT auth.role()) = 'service_role'
    );

END$$;

-- Verification query (run manually to confirm):
-- SELECT schemaname, tablename, policyname, cmd, qual 
-- FROM pg_policies 
-- WHERE tablename = 'activities' 
-- ORDER BY policyname;
