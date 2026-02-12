-- Migration 135: Fix leads_delete_definer column references
-- activities.related_id is TEXT (not lead_id), projects renamed from construction_projects
-- Use UUID params to match PostgREST schema cache expectations

-- Drop ALL overloaded signatures to avoid ambiguity
DROP FUNCTION IF EXISTS public.leads_delete_definer(UUID, UUID);
DROP FUNCTION IF EXISTS public.leads_delete_definer(TEXT, TEXT);

CREATE FUNCTION public.leads_delete_definer(
  p_lead_id  UUID,
  p_tenant_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '30s'
AS $$
BEGIN
  -- Nullify references in activities
  UPDATE public.activities
    SET related_id = NULL
  WHERE related_id = p_lead_id;

  -- Delete the lead — FK cascades handle projects.lead_id (ON DELETE SET NULL)
  -- and lead_history.lead_id (ON DELETE CASCADE)
  DELETE FROM public.leads
  WHERE id = p_lead_id
    AND tenant_id = p_tenant_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead % not found for tenant %', p_lead_id, p_tenant_id;
  END IF;
END;
$$;

-- Grant execute
GRANT EXECUTE ON FUNCTION public.leads_delete_definer(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leads_delete_definer(UUID, UUID) TO service_role;
