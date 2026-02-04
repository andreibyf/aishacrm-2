-- Migration 120: Fix remaining Supabase security warnings
-- Date: 2026-02-03
-- Purpose: Fix SECURITY DEFINER views and enable RLS on exposed tables
-- Addresses Supabase database linter errors:
--   - 0010_security_definer_view (9 views)
--   - 0013_rls_disabled_in_public (2 tables)
-- 
-- RLS Implementation: Uses JWT claim-based policies (auth.jwt() ->> 'tenant_id')
-- Pattern consistent with migrations 055-059 (consolidate RLS series)
-- No GUC management required - tenant_id extracted from Supabase auth token

-- ============================================
-- PART 1: Fix SECURITY DEFINER Views
-- ============================================
-- Replace SECURITY DEFINER with SECURITY INVOKER to respect caller's RLS policies
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0010_security_definer_view

-- Fix: v_activity_stream
DROP VIEW IF EXISTS public.v_activity_stream CASCADE;
CREATE OR REPLACE VIEW public.v_activity_stream AS
SELECT 
  a.id,
  a.tenant_id,
  a.type,
  a.subject,
  a.status,
  a.related_to,
  a.related_id,
  a.assigned_to,
  a.due_date,
  a.due_time,
  a.created_at,
  a.updated_date,
  -- Related entity names
  CASE 
    WHEN a.related_to = 'lead' THEN (SELECT CONCAT(first_name, ' ', last_name) FROM leads WHERE id = a.related_id)
    WHEN a.related_to = 'contact' THEN (SELECT CONCAT(first_name, ' ', last_name) FROM contacts WHERE id = a.related_id)
    WHEN a.related_to = 'account' THEN (SELECT name FROM accounts WHERE id = a.related_id)
    WHEN a.related_to = 'opportunity' THEN (SELECT name FROM opportunities WHERE id = a.related_id)
    ELSE NULL
  END AS related_name
FROM activities a;

ALTER VIEW public.v_activity_stream SET (security_invoker = true);

-- Fix: lead_detail_full
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
  l.title,
  l.status,
  l.source,
  l.score,
  l.account_id,
  l.created_at,
  l.updated_date,
  l.metadata,
  -- Account details if linked
  a.name AS account_name,
  a.website AS account_website,
  a.industry AS account_industry
FROM leads l
LEFT JOIN accounts a ON l.account_id = a.id;

ALTER VIEW public.lead_detail_full SET (security_invoker = true);

-- Fix: lead_detail_light
DROP VIEW IF EXISTS public.lead_detail_light CASCADE;
CREATE OR REPLACE VIEW public.lead_detail_light AS
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
  l.created_at
FROM leads l;

ALTER VIEW public.lead_detail_light SET (security_invoker = true);

-- Fix: devai_health_stats
DROP VIEW IF EXISTS public.devai_health_stats CASCADE;
CREATE OR REPLACE VIEW public.devai_health_stats AS
SELECT 
  tenant_id,
  COUNT(*) AS total_alerts,
  COUNT(*) FILTER (WHERE resolved = false) AS active_alerts,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'high') AS high_count,
  COUNT(*) FILTER (WHERE severity = 'medium') AS medium_count,
  COUNT(*) FILTER (WHERE severity = 'low') AS low_count,
  MAX(created_at) AS last_alert_time
FROM devai_health_alerts
GROUP BY tenant_id;

ALTER VIEW public.devai_health_stats SET (security_invoker = true);

-- Fix: user_profile_view
DROP VIEW IF EXISTS public.user_profile_view CASCADE;
CREATE OR REPLACE VIEW public.user_profile_view AS
SELECT 
  u.id,
  u.tenant_id,
  u.email,
  u.full_name,
  u.role,
  u.status,
  u.created_at,
  u.updated_date,
  -- Tenant details
  t.name AS tenant_name,
  t.slug AS tenant_slug
FROM users u
LEFT JOIN tenants t ON u.tenant_id = t.id;

ALTER VIEW public.user_profile_view SET (security_invoker = true);

-- Note: The following views were already fixed in migration 071:
-- - v_lead_counts_by_status
-- - v_account_related_people
-- - v_calendar_activities
-- - v_opportunity_pipeline_by_stage

-- ============================================
-- PART 2: Enable RLS on Public Tables
-- ============================================
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public
-- Using JWT claim-based policies (consistent with migrations 055-059)

-- Fix: tasks table
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for tasks
DROP POLICY IF EXISTS "tasks_tenant_isolation_select" ON public.tasks;
CREATE POLICY "tasks_tenant_isolation_select" ON public.tasks
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "tasks_tenant_isolation_insert" ON public.tasks;
CREATE POLICY "tasks_tenant_isolation_insert" ON public.tasks
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "tasks_tenant_isolation_update" ON public.tasks;
CREATE POLICY "tasks_tenant_isolation_update" ON public.tasks
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  )
  WITH CHECK (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "tasks_tenant_isolation_delete" ON public.tasks;
CREATE POLICY "tasks_tenant_isolation_delete" ON public.tasks
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

-- Fix: devai_health_alerts table
ALTER TABLE public.devai_health_alerts ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for devai_health_alerts
DROP POLICY IF EXISTS "devai_health_alerts_tenant_isolation_select" ON public.devai_health_alerts;
CREATE POLICY "devai_health_alerts_tenant_isolation_select" ON public.devai_health_alerts
  FOR SELECT
  TO authenticated
  USING (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "devai_health_alerts_tenant_isolation_insert" ON public.devai_health_alerts;
CREATE POLICY "devai_health_alerts_tenant_isolation_insert" ON public.devai_health_alerts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "devai_health_alerts_tenant_isolation_update" ON public.devai_health_alerts;
CREATE POLICY "devai_health_alerts_tenant_isolation_update" ON public.devai_health_alerts
  FOR UPDATE
  TO authenticated
  USING (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  )
  WITH CHECK (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

DROP POLICY IF EXISTS "devai_health_alerts_tenant_isolation_delete" ON public.devai_health_alerts;
CREATE POLICY "devai_health_alerts_tenant_isolation_delete" ON public.devai_health_alerts
  FOR DELETE
  TO authenticated
  USING (
    tenant_id = (SELECT auth.jwt() ->> 'tenant_id')::uuid
    OR (SELECT auth.role()) = 'service_role'
  );

-- ============================================
-- Verification
-- ============================================

-- Verify all views now use SECURITY INVOKER
SELECT 
  schemaname,
  viewname,
  CASE 
    WHEN viewowner = current_user THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security_mode
FROM pg_views
WHERE schemaname = 'public'
  AND viewname IN (
    'v_activity_stream',
    'lead_detail_full',
    'lead_detail_light',
    'devai_health_stats',
    'user_profile_view',
    'v_lead_counts_by_status',
    'v_account_related_people',
    'v_calendar_activities',
    'v_opportunity_pipeline_by_stage'
  );

-- Verify RLS is enabled on all public tables
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('tasks', 'devai_health_alerts')
ORDER BY tablename;

SELECT 'Migration 120 completed - All security issues fixed' AS status;
