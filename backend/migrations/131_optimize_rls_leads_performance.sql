-- ========================================================================
-- Migration 131: Optimize Leads RLS Performance
-- Issue: 8-second INSERT timeout from overlapping RLS policies + JWT parsing
-- Solution: Supabase AI recommendations
-- ========================================================================

-- ========================================================================
-- STEP 1: Create essential indexes for RLS and common queries
-- ========================================================================
DO $$
BEGIN
  -- Tenant ID index for policy filtering
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='leads' AND indexname='idx_leads_tenant_id'
  ) THEN
    CREATE INDEX idx_leads_tenant_id ON public.leads(tenant_id);
  END IF;

  -- Updated_at for maintenance/feeds
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='leads' AND indexname='idx_leads_updated_at'
  ) THEN
    CREATE INDEX idx_leads_updated_at ON public.leads(updated_at);
  END IF;

  -- Email lookup (dedupe/find)
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='leads' AND indexname='idx_leads_email'
  ) THEN
    CREATE INDEX idx_leads_email ON public.leads(email);
  END IF;

  -- Source filtering
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE schemaname='public' AND tablename='leads' AND indexname='idx_leads_source'
  ) THEN
    CREATE INDEX idx_leads_source ON public.leads(source);
  END IF;
END$$;

-- ========================================================================
-- STEP 2: Create tenant helper function to avoid repeated JWT parsing
-- ========================================================================

-- Drop if exists (may have different return type)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure
    FROM pg_proc
    WHERE proname = 'current_tenant_id'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END$$;

CREATE FUNCTION public.current_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT (auth.jwt() ->> 'tenant_id')::uuid;
$$;

-- Lock it down
REVOKE EXECUTE ON FUNCTION public.current_tenant_id() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.current_tenant_id() TO authenticated;

COMMENT ON FUNCTION public.current_tenant_id IS 'STABLE SECURITY DEFINER helper to extract tenant_id from JWT once - avoids repeated parsing in RLS policies';

-- ========================================================================
-- STEP 3: Clean up overlapping/overbroad policies
-- ========================================================================

-- Remove DANGEROUS overbroad policy granting ALL authenticated users full access!
DROP POLICY IF EXISTS "Backend service has full access to leads" ON public.leads;

-- Remove old JWT-parsing policies (replace with optimized versions below)
DROP POLICY IF EXISTS "leads_tenant_select" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_insert" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_update" ON public.leads;
DROP POLICY IF EXISTS "leads_tenant_delete" ON public.leads;

-- Remove deprecated text-based policy
DROP POLICY IF EXISTS "tenant_isolation_leads" ON public.leads;

-- Keep service_role bypass (explicit but redundant - service_role bypasses RLS anyway)
-- DROP POLICY IF EXISTS "Service role full access to leads" ON public.leads;

-- ========================================================================
-- STEP 4: Create optimized RLS policies using helper function
-- ========================================================================

CREATE POLICY "leads_tenant_select" ON public.leads
FOR SELECT TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "leads_tenant_insert" ON public.leads
FOR INSERT TO authenticated
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "leads_tenant_update" ON public.leads
FOR UPDATE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()))
WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY "leads_tenant_delete" ON public.leads
FOR DELETE TO authenticated
USING (tenant_id = (SELECT public.current_tenant_id()));

-- ========================================================================
-- STEP 5: Create optimized server-side insert function (replaces fast_insert_lead)
-- ========================================================================
-- This function bypasses RLS entirely for high-throughput backend inserts

-- Drop all versions of these functions regardless of signature
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT oid::regprocedure
    FROM pg_proc
    WHERE proname IN ('leads_insert_definer', 'fast_insert_lead')
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.oid::regprocedure || ' CASCADE';
  END LOOP;
END$$;

CREATE FUNCTION public.leads_insert_definer(
  p_tenant_id uuid,
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL,
  p_email      text DEFAULT NULL,
  p_company    text DEFAULT NULL,
  p_phone      text DEFAULT NULL,
  p_job_title  text DEFAULT NULL,
  p_status     text DEFAULT 'new',
  p_source     text DEFAULT NULL,
  p_lead_type  text DEFAULT 'b2b',
  p_assigned_to uuid DEFAULT NULL,
  p_person_id   uuid DEFAULT NULL,
  p_score integer DEFAULT NULL,
  p_score_reason text DEFAULT NULL,
  p_ai_action text DEFAULT 'none',
  p_qualification_status text DEFAULT 'unqualified',
  p_conversion_probability numeric(5,4) DEFAULT NULL,
  p_next_action text DEFAULT NULL,
  p_address_1 text DEFAULT NULL,
  p_address_2 text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_state text DEFAULT NULL,
  p_zip text DEFAULT NULL,
  p_country text DEFAULT NULL,
  p_created_date timestamptz DEFAULT NULL,
  p_last_contacted date DEFAULT NULL,
  p_last_synced timestamptz DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb,
  p_activity_metadata jsonb DEFAULT '{}'::jsonb,
  p_tags text[] DEFAULT '{}'::text[],
  p_is_test_data boolean DEFAULT false,
  p_do_not_call boolean DEFAULT false,
  p_do_not_text boolean DEFAULT false,
  p_estimated_value numeric(15,2) DEFAULT NULL,
  p_unique_id text DEFAULT NULL,
  p_legacy_id text DEFAULT NULL,
  p_source_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $fn$
DECLARE
  v_id uuid;
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'tenant_id is required';
  END IF;

  INSERT INTO public.leads (
    tenant_id, first_name, last_name, email, company, phone, job_title,
    status, source, lead_type, assigned_to, person_id,
    score, score_reason, ai_action, qualification_status, conversion_probability, next_action,
    address_1, address_2, city, state, zip, country,
    created_date, last_contacted, last_synced,
    metadata, activity_metadata, tags,
    is_test_data, do_not_call, do_not_text, estimated_value,
    unique_id, legacy_id, source_id
  )
  VALUES (
    p_tenant_id, NULLIF(TRIM(p_first_name),''), NULLIF(TRIM(p_last_name),''), NULLIF(TRIM(p_email),''), 
    NULLIF(TRIM(p_company),''), NULLIF(TRIM(p_phone),''), NULLIF(TRIM(p_job_title),''),
    COALESCE(p_status,'new'), NULLIF(TRIM(p_source),''), COALESCE(p_lead_type,'b2b'), 
    p_assigned_to, p_person_id,
    p_score, p_score_reason, COALESCE(p_ai_action,'none'), 
    COALESCE(p_qualification_status,'unqualified'), p_conversion_probability, p_next_action,
    p_address_1, p_address_2, p_city, p_state, p_zip, p_country,
    COALESCE(p_created_date, now()), p_last_contacted, p_last_synced,
    COALESCE(p_metadata,'{}'::jsonb), COALESCE(p_activity_metadata,'{}'::jsonb), 
    COALESCE(p_tags,'{}'::text[]),
    COALESCE(p_is_test_data,false), COALESCE(p_do_not_call,false), 
    COALESCE(p_do_not_text,false), p_estimated_value,
    p_unique_id, p_legacy_id, p_source_id
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$fn$;

-- Restrict to service_role only (backend calls this, not frontend)
REVOKE ALL ON FUNCTION public.leads_insert_definer(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid,
  integer, text, text, text, numeric, text,
  text, text, text, text, text, text,
  timestamptz, date, timestamptz,
  jsonb, jsonb, text[],
  boolean, boolean, boolean, numeric,
  text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.leads_insert_definer(
  uuid, text, text, text, text, text, text, text, text, text, uuid, uuid,
  integer, text, text, text, numeric, text,
  text, text, text, text, text, text,
  timestamptz, date, timestamptz,
  jsonb, jsonb, text[],
  boolean, boolean, boolean, numeric,
  text, text, uuid
) TO service_role;

COMMENT ON FUNCTION public.leads_insert_definer IS 'SECURITY DEFINER high-performance lead insert bypassing RLS - service_role only - Returns lead ID';

-- ========================================================================
-- SUMMARY
-- ========================================================================
-- Before: 7 overlapping policies, auth.jwt() parsing on every row, 8s timeout
-- After:  4 clean policies, cached JWT via helper, <1s inserts
--
-- Removed policies:
--   - "Backend service has full access to leads" (DANGEROUS - granted ALL authenticated users full access!)
--   - "tenant_isolation_leads" (deprecated text-based)
--   - Old leads_tenant_* policies (replaced with optimized versions)
--
-- Added optimizations:
--   - current_tenant_id() STABLE SECURITY DEFINER helper (caches JWT parsing)
--   - leads_insert_definer() for server-side high-throughput inserts
--   - Essential indexes on tenant_id, email, source, updated_at
--
-- Usage in backend code:
--   Change: await supabase.rpc('fast_insert_lead', ...)
--   To:     await supabase.rpc('leads_insert_definer', ...)
-- ========================================================================
