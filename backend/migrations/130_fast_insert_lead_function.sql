-- Fast lead insert function that bypasses RLS overhead
-- Uses SECURITY DEFINER to run with function owner's privileges, skipping RLS checks
-- This is safe because tenant_id validation is enforced at application layer

CREATE OR REPLACE FUNCTION public.fast_insert_lead(
  p_tenant_id uuid,
  p_first_name text,
  p_last_name text,
  p_email text DEFAULT NULL,
  p_phone text DEFAULT NULL,
  p_company text DEFAULT NULL,
  p_job_title text DEFAULT NULL,
  p_source text DEFAULT NULL,
  p_status text DEFAULT 'new',
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  company text,
  job_title text,
  status text,
  source text,
  created_at timestamptz,
  created_date timestamptz,
  updated_at timestamptz,
  metadata jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_now timestamptz := now();
BEGIN
  -- Validation
  IF p_tenant_id IS NULL OR p_first_name IS NULL OR p_last_name IS NULL THEN
    RAISE EXCEPTION 'tenant_id, first_name, and last_name are required';
  END IF;

  -- Direct insert bypassing RLS
  RETURN QUERY
  INSERT INTO leads (
    tenant_id, first_name, last_name, email, phone, company, job_title,
    status, source, created_at, created_date, updated_at, metadata
  ) VALUES (
    p_tenant_id, 
    TRIM(p_first_name), 
    TRIM(p_last_name), 
    NULLIF(TRIM(p_email), ''),
    NULLIF(TRIM(p_phone), ''),
    NULLIF(TRIM(p_company), ''),
    NULLIF(TRIM(p_job_title), ''),
    COALESCE(p_status, 'new'),
    NULLIF(TRIM(p_source), ''),
    v_now, v_now, v_now,
    COALESCE(p_metadata, '{}'::jsonb)
  )
  RETURNING 
    leads.id, leads.tenant_id, leads.first_name, leads.last_name, 
    leads.email, leads.phone, leads.company, leads.job_title,
    leads.status, leads.source, leads.created_at, leads.created_date,
    leads.updated_at, leads.metadata;
END;
$$;

-- Lock down to service role only (backend calls this, not frontend)
REVOKE ALL ON FUNCTION public.fast_insert_lead FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fast_insert_lead TO service_role;

COMMENT ON FUNCTION public.fast_insert_lead IS 'SECURITY DEFINER lead insert bypassing RLS for performance - service_role only';
