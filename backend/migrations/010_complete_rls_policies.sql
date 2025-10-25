-- Row Level Security (RLS) Setup for Additional Tables
-- This migration enables RLS on all tables that were missing RLS policies
-- Run this after applying the complete schema migration

-- ============================================
-- STEP 1: Enable RLS on All Missing Tables
-- ============================================

-- Enable RLS on all tables that were identified as missing RLS
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_customization ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE note ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE file ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bizdev_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution ENABLE ROW LEVEL SECURITY;

-- Row Level Security (RLS) Setup for Additional Tables
-- This migration enables RLS on all tables that were missing RLS policies
-- Run this after applying the complete schema migration

-- ============================================
-- STEP 1: Enable RLS on All Missing Tables
-- ============================================

-- Enable RLS on all tables that were identified as missing RLS
ALTER TABLE tenant ENABLE ROW LEVEL SECURITY;
ALTER TABLE field_customization ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE note ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plan ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentation ENABLE ROW LEVEL SECURITY;
ALTER TABLE file ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_report ENABLE ROW LEVEL SECURITY;
ALTER TABLE tenant_integration ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_invitation ENABLE ROW LEVEL SECURITY;
ALTER TABLE guide_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_campaign ENABLE ROW LEVEL SECURITY;
ALTER TABLE api_key ENABLE ROW LEVEL SECURITY;
ALTER TABLE cash_flow ENABLE ROW LEVEL SECURITY;
ALTER TABLE cron_job ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template ENABLE ROW LEVEL SECURITY;
ALTER TABLE checkpoint ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_sales_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE bizdev_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE archive_index ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_requirement ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_execution ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STEP 2: Create Service Role Policies
-- ============================================
-- These policies allow the backend (using service role key) full access
-- The backend handles all access control logic via tenant_id filtering

-- Tenant (global table - special handling)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant' AND policyname = 'Service role full access to tenant') THEN
    CREATE POLICY "Service role full access to tenant"
      ON tenant
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Field Customization
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'field_customization' AND policyname = 'Service role full access to field_customization') THEN
    CREATE POLICY "Service role full access to field_customization"
      ON field_customization
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Audit Log
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'audit_log' AND policyname = 'Service role full access to audit_log') THEN
    CREATE POLICY "Service role full access to audit_log"
      ON audit_log
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Notes
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'note' AND policyname = 'Service role full access to note') THEN
    CREATE POLICY "Service role full access to note"
      ON note
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Subscription Plan (global table)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscription_plan' AND policyname = 'Service role full access to subscription_plan') THEN
    CREATE POLICY "Service role full access to subscription_plan"
      ON subscription_plan
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Subscription
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'subscription' AND policyname = 'Service role full access to subscription') THEN
    CREATE POLICY "Service role full access to subscription"
      ON subscription
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Webhook
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'webhook' AND policyname = 'Service role full access to webhook') THEN
    CREATE POLICY "Service role full access to webhook"
      ON webhook
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Documentation (global table)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'documentation' AND policyname = 'Service role full access to documentation') THEN
    CREATE POLICY "Service role full access to documentation"
      ON documentation
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Files
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'file' AND policyname = 'Service role full access to file') THEN
    CREATE POLICY "Service role full access to file"
      ON file
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Test Reports
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'test_report' AND policyname = 'Service role full access to test_report') THEN
    CREATE POLICY "Service role full access to test_report"
      ON test_report
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Tenant Integrations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'tenant_integration' AND policyname = 'Service role full access to tenant_integration') THEN
    CREATE POLICY "Service role full access to tenant_integration"
      ON tenant_integration
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Announcements
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'announcement' AND policyname = 'Service role full access to announcement') THEN
    CREATE POLICY "Service role full access to announcement"
      ON announcement
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- User Invitations
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'user_invitation' AND policyname = 'Service role full access to user_invitation') THEN
    CREATE POLICY "Service role full access to user_invitation"
      ON user_invitation
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Guide Content (global table)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'guide_content' AND policyname = 'Service role full access to guide_content') THEN
    CREATE POLICY "Service role full access to guide_content"
      ON guide_content
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- AI Campaigns
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ai_campaign' AND policyname = 'Service role full access to ai_campaign') THEN
    CREATE POLICY "Service role full access to ai_campaign"
      ON ai_campaign
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- API Keys
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'api_key' AND policyname = 'Service role full access to api_key') THEN
    CREATE POLICY "Service role full access to api_key"
      ON api_key
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Cash Flow
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cash_flow' AND policyname = 'Service role full access to cash_flow') THEN
    CREATE POLICY "Service role full access to cash_flow"
      ON cash_flow
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Cron Jobs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cron_job' AND policyname = 'Service role full access to cron_job') THEN
    CREATE POLICY "Service role full access to cron_job"
      ON cron_job
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Performance Logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'performance_log' AND policyname = 'Service role full access to performance_log') THEN
    CREATE POLICY "Service role full access to performance_log"
      ON performance_log
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Email Templates
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'email_template' AND policyname = 'Service role full access to email_template') THEN
    CREATE POLICY "Service role full access to email_template"
      ON email_template
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Checkpoints
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'checkpoint' AND policyname = 'Service role full access to checkpoint') THEN
    CREATE POLICY "Service role full access to checkpoint"
      ON checkpoint
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Contact History
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'contact_history' AND policyname = 'Service role full access to contact_history') THEN
    CREATE POLICY "Service role full access to contact_history"
      ON contact_history
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Lead History
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'lead_history' AND policyname = 'Service role full access to lead_history') THEN
    CREATE POLICY "Service role full access to lead_history"
      ON lead_history
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Daily Sales Metrics
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'daily_sales_metrics' AND policyname = 'Service role full access to daily_sales_metrics') THEN
    CREATE POLICY "Service role full access to daily_sales_metrics"
      ON daily_sales_metrics
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Cache (global table - special handling for cache keys)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'cache' AND policyname = 'Service role full access to cache') THEN
    CREATE POLICY "Service role full access to cache"
      ON cache
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Import Logs
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'import_log' AND policyname = 'Service role full access to import_log') THEN
    CREATE POLICY "Service role full access to import_log"
      ON import_log
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- BizDev Sources
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'bizdev_source' AND policyname = 'Service role full access to bizdev_source') THEN
    CREATE POLICY "Service role full access to bizdev_source"
      ON bizdev_source
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Archive Index
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'archive_index' AND policyname = 'Service role full access to archive_index') THEN
    CREATE POLICY "Service role full access to archive_index"
      ON archive_index
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Client Requirements
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'client_requirement' AND policyname = 'Service role full access to client_requirement') THEN
    CREATE POLICY "Service role full access to client_requirement"
      ON client_requirement
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Workflows
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow' AND policyname = 'Service role full access to workflow') THEN
    CREATE POLICY "Service role full access to workflow"
      ON workflow
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Workflow Executions
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'workflow_execution' AND policyname = 'Service role full access to workflow_execution') THEN
    CREATE POLICY "Service role full access to workflow_execution"
      ON workflow_execution
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================
-- STEP 3: Optional - Authenticated User Policies
-- ============================================
-- Uncomment these if you want to allow direct Supabase client access
-- Currently, all access goes through the backend, so these are not needed

/*
-- Example tenant-scoped policies for authenticated users
-- These would only work if you have proper JWT tokens with tenant_id claims

-- Field Customization - users can only see their tenant's customizations
CREATE POLICY "Users can view own tenant field_customization"
  ON field_customization
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.jwt()->>'tenant_id');

-- Notes - users can only see their tenant's notes
CREATE POLICY "Users can view own tenant notes"
  ON note
  FOR SELECT
  TO authenticated
  USING (tenant_id = auth.jwt()->>'tenant_id');

-- Add similar policies for other tenant-scoped tables as needed
-- Global tables (like subscription_plan, documentation) might need different policies
*/

-- ============================================
-- STEP 4: Verify RLS is Enabled
-- ============================================

-- Check which tables have RLS enabled
SELECT
  schemaname,
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY tablename;

-- View all policies
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;

-- ============================================
-- Notes
-- ============================================
-- 1. RLS is now enabled on all tables in the complete schema
-- 2. Only the service role (backend) has access to all tables
-- 3. Direct client access is blocked (secure by default)
-- 4. Backend handles all authentication and authorization
-- 5. Backend filters by tenant_id to ensure data isolation
-- 6. Global tables (tenant, subscription_plan, documentation, guide_content, cache)
--    have special handling as they don't follow tenant_id filtering

-- For Production Security Considerations:
-- - Consider more granular policies based on user roles
-- - Add audit logging for sensitive operations
-- - Implement rate limiting at the application level
-- - Regular security reviews of policies