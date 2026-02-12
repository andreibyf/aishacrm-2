-- ========================================================================
-- Migration 134: Fix statement_timeout on SECURITY DEFINER functions
-- Issue: leads_insert_definer inherits PostgREST's 8s statement_timeout
--        even though it bypasses RLS, causing the INSERT to still time out.
-- Fix:   ALTER FUNCTION to SET statement_timeout = '30s' so it runs
--        independently of the session-level PostgREST timeout.
-- ========================================================================

-- Fix leads_insert_definer: add statement_timeout override
ALTER FUNCTION public.leads_insert_definer SET statement_timeout = '30s';

-- Also create/fix the DELETE definer with the same pattern
-- Drop if exists (any signature)
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT oid::regprocedure FROM pg_proc
    WHERE proname = 'leads_delete_definer'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END$$;

CREATE FUNCTION public.leads_delete_definer(p_lead_id uuid, p_tenant_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '30s'
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_lead_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'lead_id and tenant_id are required';
  END IF;

  -- Detach FK references before deleting
  UPDATE public.activities      SET lead_id = NULL WHERE lead_id = p_lead_id;
  UPDATE public.construction_projects SET lead_id = NULL WHERE lead_id = p_lead_id;

  -- Remove person_profile if linked
  DELETE FROM public.person_profile WHERE person_id = p_lead_id;

  -- Delete the lead
  DELETE FROM public.leads
    WHERE id = p_lead_id AND tenant_id = p_tenant_id
    RETURNING id INTO v_id;

  RETURN v_id;   -- NULL if not found (caller returns 404)
END;
$$;

-- Lock down permissions
REVOKE ALL ON FUNCTION public.leads_delete_definer(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.leads_delete_definer(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.leads_delete_definer(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.leads_delete_definer(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.leads_delete_definer IS
  'SECURITY DEFINER lead delete — cleans FK refs, bypasses RLS, 30s timeout — service_role only';
