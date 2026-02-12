-- Migration 133: Fast lead delete function bypassing RLS overhead
-- Same pattern as leads_insert_definer: SECURITY DEFINER + service_role only

-- Drop if exists
DO $$
DECLARE r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure
    FROM pg_proc
    WHERE proname = 'leads_delete_definer'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END$$;

CREATE FUNCTION public.leads_delete_definer(
  p_lead_id uuid,
  p_tenant_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_lead_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'lead_id and tenant_id are required';
  END IF;

  -- Nullify FK references in related tables first (bypass their RLS too)
  UPDATE public.activities SET lead_id = NULL WHERE lead_id = p_lead_id;
  UPDATE public.construction_projects SET lead_id = NULL WHERE lead_id = p_lead_id;
  
  -- Delete person_profile if exists
  DELETE FROM public.person_profile WHERE person_id = p_lead_id;

  -- Delete the lead
  DELETE FROM public.leads
  WHERE id = p_lead_id AND tenant_id = p_tenant_id
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.leads_delete_definer(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leads_delete_definer(uuid, uuid) TO service_role;

COMMENT ON FUNCTION public.leads_delete_definer IS 'SECURITY DEFINER lead delete bypassing RLS - handles FK cleanup - service_role only';
