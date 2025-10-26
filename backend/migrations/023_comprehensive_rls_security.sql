-- ============================================
-- COMPREHENSIVE RLS SECURITY AUDIT & FIX
-- ============================================
-- This migration ensures ALL public schema tables have:
-- 1. Row Level Security (RLS) enabled
-- 2. Proper policies or access restrictions
-- 3. No unintended public access
--
-- Run this to fix all Supabase security warnings

-- ============================================
-- STEP 1: Enable RLS on ALL tables
-- ============================================

-- Core CRM Tables
ALTER TABLE IF EXISTS public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.employees ENABLE ROW LEVEL SECURITY;

-- Tenant & Multi-tenancy
ALTER TABLE IF EXISTS public.tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.tenant_integrations ENABLE ROW LEVEL SECURITY;

-- System Tables
ALTER TABLE IF EXISTS public.system_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.performance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.systembranding ENABLE ROW LEVEL SECURITY;

-- Configuration & Settings
ALTER TABLE IF EXISTS public.modulesettings ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.field_customization ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.apikey ENABLE ROW LEVEL SECURITY;

-- Notifications & Communication
ALTER TABLE IF EXISTS public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.email_template ENABLE ROW LEVEL SECURITY;

-- Business Intelligence
ALTER TABLE IF EXISTS public.bizdev_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.bizdev_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cash_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.daily_sales_metrics ENABLE ROW LEVEL SECURITY;

-- Workflow & Automation
ALTER TABLE IF EXISTS public.workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.workflow_execution ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cron_job ENABLE ROW LEVEL SECURITY;

-- Data Management
ALTER TABLE IF EXISTS public.note ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.file ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.import_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.archive_index ENABLE ROW LEVEL SECURITY;

-- History & Tracking
ALTER TABLE IF EXISTS public.contact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.lead_history ENABLE ROW LEVEL SECURITY;

-- Subscriptions & Billing
ALTER TABLE IF EXISTS public.subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.subscription_plan ENABLE ROW LEVEL SECURITY;

-- AI & Campaigns
ALTER TABLE IF EXISTS public.ai_campaign ENABLE ROW LEVEL SECURITY;

-- Misc
ALTER TABLE IF EXISTS public.webhook ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.user_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.guide_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.test_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.client_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.conversation_messages ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Revoke Public Access from Sensitive Tables
-- ============================================

-- System/Internal Tables - Backend Only
REVOKE ALL ON public.performance_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.performance_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.system_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.audit_log FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.api_key FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.apikey FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cron_job FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.cache FROM PUBLIC, anon, authenticated;

-- Grant INSERT only to authenticated for logging tables
GRANT INSERT ON public.performance_logs TO authenticated;
GRANT INSERT ON public.system_logs TO authenticated;

-- ============================================
-- STEP 3: Create Default Tenant-Scoped Policies
-- ============================================

-- Default policy pattern: Users can only access data from their tenant
-- This applies to most CRM tables

DO $$
DECLARE
    t TEXT;
    tables TEXT[] := ARRAY[
        'accounts', 'activities', 'contacts', 'leads', 'opportunities',
        'notifications', 'note', 'client_requirement', 'cash_flow',
        'workflow', 'workflow_execution', 'bizdev_source'
    ];
BEGIN
    FOREACH t IN ARRAY tables
    LOOP
        -- Drop existing policies if they exist
        EXECUTE format('DROP POLICY IF EXISTS "tenant_isolation_%s" ON %I', t, t);
        
        -- Create tenant isolation policy for SELECT
        EXECUTE format('
            CREATE POLICY "tenant_isolation_%s"
            ON %I
            FOR ALL
            TO authenticated
            USING (tenant_id = current_setting(''app.current_tenant_id'', true))
        ', t, t);
    END LOOP;
END $$;

-- ============================================
-- STEP 4: Create Admin-Only Policies
-- ============================================

-- Tenant table: Only backend service_role can manage tenants
-- (Since you're using Express backend, not PostgREST for admin operations)
DROP POLICY IF EXISTS "service_role_only_tenants" ON public.tenant;
CREATE POLICY "service_role_only_tenants"
ON public.tenant
FOR ALL
TO authenticated
USING (false)  -- Deny all PostgREST access, only service_role can access
WITH CHECK (false);

-- Module settings: Only backend service_role
DROP POLICY IF EXISTS "service_role_only_modulesettings" ON public.modulesettings;
CREATE POLICY "service_role_only_modulesettings"
ON public.modulesettings
FOR ALL
TO authenticated
USING (false)  -- Deny all PostgREST access, only service_role can access
WITH CHECK (false);

-- ============================================
-- VERIFICATION
-- ============================================

-- Check which tables still have RLS disabled
SELECT
    schemaname,
    tablename,
    rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND rowsecurity = false
ORDER BY tablename;

-- Count policies per table
SELECT
    tablename,
    COUNT(*) as policy_count
FROM pg_policies
WHERE schemaname = 'public'
GROUP BY tablename
ORDER BY policy_count DESC, tablename;

-- Tables without any policies (potential security issues)
SELECT t.tablename
FROM pg_tables t
LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
WHERE t.schemaname = 'public'
  AND t.rowsecurity = true
  AND p.policyname IS NULL
ORDER BY t.tablename;
