-- Migration 136: Create leads_update_definer for 30s timeout on UPDATE
-- Problem: PostgREST sets statement_timeout = 8s, UPDATE hits it on slow connections
-- Solution: SECURITY DEFINER function with SET statement_timeout = '30s'

CREATE OR REPLACE FUNCTION public.leads_update_definer(
  p_lead_id    UUID,
  p_tenant_id  UUID,
  p_payload    JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '30s'
AS $$
DECLARE
  result RECORD;
  _key   TEXT;
  set_parts TEXT[] := ARRAY[]::TEXT[];
  -- Whitelist of allowed update fields (must match backend ALLOWED_UPDATE_FIELDS)
  allowed TEXT[] := ARRAY[
    'first_name','last_name','email','phone','company','job_title',
    'status','source','score','score_reason','estimated_value',
    'do_not_call','do_not_text','address_1','address_2','city','state',
    'zip','country','unique_id','tags','is_test_data','assigned_to'
  ];
BEGIN
  -- Build SET clauses from whitelisted fields in the payload
  FOR _key IN SELECT jsonb_object_keys(p_payload)
  LOOP
    IF _key = ANY(allowed) THEN
      set_parts := array_append(set_parts, format('%I = %L', _key, p_payload ->> _key));
    END IF;
  END LOOP;

  -- Handle metadata merge separately (deep merge with existing)
  IF p_payload ? 'metadata' AND jsonb_typeof(p_payload -> 'metadata') = 'object' THEN
    set_parts := array_append(set_parts, format(
      'metadata = COALESCE(metadata, ''{}''::jsonb) || %L::jsonb',
      (p_payload -> 'metadata')::text
    ));
  END IF;

  -- Always update timestamp
  set_parts := array_append(set_parts, 'updated_at = NOW()');

  IF array_length(set_parts, 1) IS NULL OR array_length(set_parts, 1) = 0 THEN
    RAISE EXCEPTION 'No valid fields to update';
  END IF;

  EXECUTE format(
    'UPDATE public.leads SET %s WHERE id = %L AND tenant_id = %L RETURNING *',
    array_to_string(set_parts, ', '),
    p_lead_id,
    p_tenant_id
  ) INTO result;

  IF result IS NULL THEN
    RAISE EXCEPTION 'Lead % not found for tenant %', p_lead_id, p_tenant_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;

-- Grant execute to authenticated and service_role
GRANT EXECUTE ON FUNCTION public.leads_update_definer(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leads_update_definer(UUID, UUID, JSONB) TO service_role;
