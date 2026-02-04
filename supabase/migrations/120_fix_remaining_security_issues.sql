-- Migration 120: Fix remaining Supabase security warnings (CORRECTED VERSION)
-- Date: 2026-02-03
-- Purpose: Fix SECURITY DEFINER views and enable RLS on exposed tables
-- Addresses Supabase database linter errors:
--   - 0010_security_definer_view (8 views - NOT 9, devai_health_stats is NOT in linter)
--   - 0013_rls_disabled_in_public (2 tables: tasks, devai_health_alerts)
-- 
-- RLS Implementation: Uses JWT claim-based policies (auth.jwt() ->> 'tenant_id')
-- Pattern consistent with migrations 055-059 (consolidate RLS series)
-- No GUC management required - tenant_id extracted from Supabase auth token

-- ============================================
-- PART 1: Fix SECURITY DEFINER Views (8 Total)
-- ============================================
-- Replace SECURITY DEFINER with SECURITY INVOKER to respect caller's RLS policies
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

-- Note: Migration 071 attempted to fix 4 of these views but they remain SECURITY DEFINER
-- Re-applying ALL 8 views identified in fresh linter output

-- View 1: v_account_related_people
DROP VIEW IF EXISTS public.v_account_related_people CASCADE;
CREATE OR REPLACE VIEW public.v_account_related_people AS
SELECT 
  c.tenant_id,
  c.account_id,
  c.id AS person_id,
  'contact'::text AS person_type,
  c.first_name,
  c.last_name,
  c.email,
  c.phone,
  c.status,
  c.created_at
FROM contacts c
UNION ALL
SELECT 
  l.tenant_id,
  l.account_id,
  l.id AS person_id,
  'lead'::text AS person_type,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.status,
  l.created_at
FROM leads l
WHERE l.account_id IS NOT NULL;

ALTER VIEW public.v_account_related_people SET (security_invoker = true);

-- View 2: v_opportunity_pipeline_by_stage
DROP VIEW IF EXISTS public.v_opportunity_pipeline_by_stage CASCADE;
CREATE OR REPLACE VIEW public.v_opportunity_pipeline_by_stage AS
SELECT 
  tenant_id,
  stage,
  count(*) AS count
FROM opportunities
GROUP BY tenant_id, stage;

ALTER VIEW public.v_opportunity_pipeline_by_stage SET (security_invoker = true);

-- View 3: v_activity_stream
DROP VIEW IF EXISTS public.v_activity_stream CASCADE;
CREATE OR REPLACE VIEW public.v_activity_stream AS
SELECT 
  a.id,
  a.tenant_id,
  a.type,
  a.subject,
  a.status,
  a.priority,
  a.assigned_to,
  a.related_to,
  a.related_id,
  a.related_name,
  a.due_date,
  a.created_at,
  a.updated_date
FROM activities a;

ALTER VIEW public.v_activity_stream SET (security_invoker = true);

-- View 4: lead_detail_full
DROP VIEW IF EXISTS public.lead_detail_full CASCADE;
CREATE OR REPLACE VIEW public.lead_detail_full AS
SELECT 
  l.id,
  l.tenant_id,
  l.first_name,
  l.last_name,
  l.email,
  l.phone,
  l.company,
  l.status,
  l.source,
  l.assigned_to,
  l.account_id,
  a.name AS account_name,
  l.created_date,
  l.updated_at
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.id AND l.tenant_id = a.tenant_id;

ALTER VIEW public.lead_detail_full SET (security_invoker = true);

-- View 5: lead_detail_light
DROP VIEW IF EXISTS public.lead_detail_light CASCADE;
CREATE OR REPLACE VIEW public.lead_detail_light AS
SELECT 
  id,
  tenant_id,
  first_name,
  last_name,
  email,
  phone,
  company,
  status,
  created_date
FROM leads;

ALTER VIEW public.lead_detail_light SET (security_invoker = true);

-- View 6: v_calendar_activities
DROP VIEW IF EXISTS public.v_calendar_activities CASCADE;
CREATE OR REPLACE VIEW public.v_calendar_activities AS
SELECT 
  id,
  tenant_id,
  type,
  subject,
  status,
  assigned_to,
  related_to,
  related_id,
  due_date,
  due_time,
  CASE
    WHEN (due_date IS NOT NULL AND due_time IS NOT NULL) 
    THEN (due_date::timestamp without time zone + due_time::interval)
    WHEN (due_date IS NOT NULL) 
    THEN (due_date::timestamp without time zone + '12:00:00'::time without time zone::interval)
    ELSE NULL::timestamp without time zone
  END AS due_at,
  created_at,
  updated_date AS updated_at
FROM activities a;

ALTER VIEW public.v_calendar_activities SET (security_invoker = true);

-- View 7: user_profile_view
DROP VIEW IF EXISTS public.user_profile_view CASCADE;
CREATE OR REPLACE VIEW public.user_profile_view AS
SELECT
  u.id,
  u.email,
  u.tenant_uuid AS tenant_id,
  t.name AS tenant_name,
  u.role,
  u.status,
  u.created_at
FROM users u
LEFT JOIN tenant t ON u.tenant_uuid = t.id;

ALTER VIEW public.user_profile_view SET (security_invoker = true);

-- View 8: v_lead_counts_by_status
DROP VIEW IF EXISTS public.v_lead_counts_by_status CASCADE;
CREATE OR REPLACE VIEW public.v_lead_counts_by_status AS
SELECT 
  tenant_id,
  status,
  count(*) AS count
FROM leads
GROUP BY tenant_id, status;

ALTER VIEW public.v_lead_counts_by_status SET (security_invoker = true);

-- NOTE: devai_health_stats view was NOT in the linter output (only 8 SECURITY DEFINER views listed)
-- It's a global health monitoring view with no tenant_id, so it doesn't need SECURITY INVOKER treatment

-- ============================================
-- PART 2: Enable RLS on Public Tables (2 Total)
-- ============================================
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
-- Using JWT claim-based policies (consistent with migrations 055-059)

-- Table 1: tasks
-- Enable RLS
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Policy 1: SELECT - Users can view tasks for their tenant
CREATE POLICY tasks_select_policy ON public.tasks
  FOR SELECT
  USING (
    -- Service role bypass (admin operations)
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Regular users see only their tenant's tasks
    tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
  );

-- Policy 2: INSERT - Users can create tasks for their tenant
CREATE POLICY tasks_insert_policy ON public.tasks
  FOR INSERT
  WITH CHECK (
    -- Service role bypass
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Regular users can only create for their tenant
    tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
  );

-- Policy 3: UPDATE - Users can update their tenant's tasks
CREATE POLICY tasks_update_policy ON public.tasks
  FOR UPDATE
  USING (
    -- Service role bypass
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Regular users can only update their tenant's tasks
    tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
  );

-- Policy 4: DELETE - Users can delete their tenant's tasks
CREATE POLICY tasks_delete_policy ON public.tasks
  FOR DELETE
  USING (
    -- Service role bypass
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Regular users can only delete their tenant's tasks
    tenant_id = (SELECT (auth.jwt() ->> 'tenant_id')::uuid)
  );

-- Table 2: devai_health_alerts
-- NOTE: This is a GLOBAL system table (no tenant_id column per migration 114)
-- DevAI health monitoring is superadmin-only, not tenant-scoped
-- Enable RLS with superadmin-only access
ALTER TABLE public.devai_health_alerts ENABLE ROW LEVEL SECURITY;

-- Policy 1: SELECT - Only superadmins can view health alerts
CREATE POLICY devai_health_alerts_select_policy ON public.devai_health_alerts
  FOR SELECT
  USING (
    -- Service role bypass (backend operations)
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Superadmin users only (check user role from users table)
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = (auth.jwt() ->> 'sub')::uuid 
      AND role = 'superadmin'
    )
  );

-- Policy 2: INSERT - Backend service role can create health alerts
CREATE POLICY devai_health_alerts_insert_policy ON public.devai_health_alerts
  FOR INSERT
  WITH CHECK (
    -- Only service role (automated health monitoring)
    auth.jwt() ->> 'role' = 'service_role'
  );

-- Policy 3: UPDATE - Superadmins can resolve/update health alerts
CREATE POLICY devai_health_alerts_update_policy ON public.devai_health_alerts
  FOR UPDATE
  USING (
    -- Service role bypass
    auth.jwt() ->> 'role' = 'service_role'
    OR
    -- Superadmin users only
    EXISTS (
      SELECT 1 FROM users 
      WHERE id = (auth.jwt() ->> 'sub')::uuid 
      AND role = 'superadmin'
    )
  );

-- Policy 4: DELETE - Only service role can delete health alerts (cleanup)
CREATE POLICY devai_health_alerts_delete_policy ON public.devai_health_alerts
  FOR DELETE
  USING (
    -- Only service role (automated cleanup)
    auth.jwt() ->> 'role' = 'service_role'
  );

-- ============================================
-- Verification Queries
-- ============================================
-- Run these after applying migration to verify:

-- 1. Check all 8 views are now SECURITY INVOKER:
SELECT 
  schemaname,
  viewname,
  CASE 
    WHEN viewowner = CURRENT_USER THEN 'INVOKER'
    ELSE 'DEFINER'
  END AS security_mode
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'v_account_related_people',
    'v_opportunity_pipeline_by_stage',
    'v_activity_stream',
    'lead_detail_full',
    'lead_detail_light',
    'v_calendar_activities',
    'user_profile_view',
    'v_lead_counts_by_status'
  )
ORDER BY viewname;

-- 2. Check RLS is enabled on both tables:
SELECT 
  schemaname,
  tablename,
  rowsecurity AS rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tasks', 'devai_health_alerts');

-- 3. Verify policies exist:
SELECT 
  schemaname,
  tablename,
  policyname,
  cmd AS operation,
  qual AS using_expression
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('tasks', 'devai_health_alerts')
ORDER BY tablename, policyname;
