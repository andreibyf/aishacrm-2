-- Migration 145: assignment history table + leads_update_definer tags[] handling

-- -----------------------------------------------------------------------------
-- 1) Assignment history (idempotent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assignment_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  assigned_from UUID NULL,
  assigned_to UUID NULL,
  assigned_by UUID NULL,
  action TEXT NOT NULL CHECK (action IN ('assign', 'reassign', 'unassign')),
  note TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignment_history_tenant_entity_created
  ON public.assignment_history (tenant_id, entity_type, entity_id, created_at);

CREATE INDEX IF NOT EXISTS idx_assignment_history_tenant_assigned_to
  ON public.assignment_history (tenant_id, assigned_to, created_at);

-- -----------------------------------------------------------------------------
-- 2) Fix leads_update_definer to support tags text[] payloads
-- -----------------------------------------------------------------------------
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
  _key TEXT;
  set_parts TEXT[] := ARRAY[]::TEXT[];
  allowed TEXT[] := ARRAY[
    'first_name','last_name','email','phone','company','job_title',
    'status','source','score','score_reason','estimated_value',
    'do_not_call','do_not_text','address_1','address_2','city','state',
    'zip','country','unique_id','tags','is_test_data','assigned_to'
  ];
BEGIN
  FOR _key IN SELECT jsonb_object_keys(p_payload)
  LOOP
    IF _key = ANY(allowed) THEN
      IF _key = 'tags' THEN
        IF jsonb_typeof(p_payload -> _key) = 'array' THEN
          set_parts := array_append(
            set_parts,
            format('tags = ARRAY(SELECT jsonb_array_elements_text(%L::jsonb))', (p_payload -> _key)::text)
          );
        ELSIF jsonb_typeof(p_payload -> _key) = 'null' THEN
          set_parts := array_append(set_parts, 'tags = NULL');
        ELSE
          RAISE EXCEPTION 'Invalid tags payload type: expected array or null';
        END IF;
      ELSE
        set_parts := array_append(set_parts, format('%I = %L', _key, p_payload ->> _key));
      END IF;
    END IF;
  END LOOP;

  IF p_payload ? 'metadata' AND jsonb_typeof(p_payload -> 'metadata') = 'object' THEN
    set_parts := array_append(set_parts, format(
      'metadata = COALESCE(metadata, ''{}''::jsonb) || %L::jsonb',
      (p_payload -> 'metadata')::text
    ));
  END IF;

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

GRANT EXECUTE ON FUNCTION public.leads_update_definer(UUID, UUID, JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.leads_update_definer(UUID, UUID, JSONB) TO service_role;
