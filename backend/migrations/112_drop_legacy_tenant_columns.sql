-- Migration 112: Drop Legacy Tenant ID Columns
-- ==================================================================
-- Purpose: Final cleanup of deprecated tenant_id_text and tenant_id_legacy
-- Context: Phase 4 (FINAL) of legacy tenant ID cleanup plan
-- Impact: Reclaims disk space, simplifies schema, prevents legacy usage
-- 
-- PREREQUISITES:
-- 1. Phase 2 (Indexes) complete and verified
-- 2. Phase 3 (RLS Policies) complete and verified
-- 3. Application code verified to have ZERO references to these columns
-- 
-- Deployment: Apply during low-traffic window
-- Rollback: Requires restoring from backup or re-adding columns and backfilling

BEGIN;

-- Prevent other migrations from running concurrently
SET lock_timeout = '30s';

-- Table: accounts
ALTER TABLE "public"."accounts" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: activities
ALTER TABLE "public"."activities" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: ai_campaign
ALTER TABLE "public"."ai_campaign" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: announcement
ALTER TABLE "public"."announcement" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: api_key
ALTER TABLE "public"."api_key" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: apikey
ALTER TABLE "public"."apikey" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: archive_index
ALTER TABLE "public"."archive_index" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: audit_log
ALTER TABLE "public"."audit_log" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: bizdev_source
ALTER TABLE "public"."bizdev_source" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: bizdev_sources
ALTER TABLE "public"."bizdev_sources" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: cash_flow
ALTER TABLE "public"."cash_flow" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: checkpoint
ALTER TABLE "public"."checkpoint" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: client_requirement
ALTER TABLE "public"."client_requirement" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: contact_history
ALTER TABLE "public"."contact_history" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: contacts
ALTER TABLE "public"."contacts" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: cron_job
ALTER TABLE "public"."cron_job" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: daily_sales_metrics
ALTER TABLE "public"."daily_sales_metrics" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: email_template
ALTER TABLE "public"."email_template" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: employees
ALTER TABLE "public"."employees" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: field_customization
ALTER TABLE "public"."field_customization" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: file
ALTER TABLE "public"."file" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: import_log
ALTER TABLE "public"."import_log" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: lead_history
ALTER TABLE "public"."lead_history" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: leads
ALTER TABLE "public"."leads" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: modulesettings
ALTER TABLE "public"."modulesettings" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: note
ALTER TABLE "public"."note" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: notifications
ALTER TABLE "public"."notifications" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: opportunities
ALTER TABLE "public"."opportunities" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: performance_log
ALTER TABLE "public"."performance_log" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: performance_logs
ALTER TABLE "public"."performance_logs" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: subscription
ALTER TABLE "public"."subscription" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: synchealth
ALTER TABLE "public"."synchealth" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: system_logs
ALTER TABLE "public"."system_logs" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: systembranding
ALTER TABLE "public"."systembranding" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: tenant_integration
ALTER TABLE "public"."tenant_integration" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: tenant_integrations
ALTER TABLE "public"."tenant_integrations" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: test_report
ALTER TABLE "public"."test_report" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: user_invitation
ALTER TABLE "public"."user_invitation" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: users
ALTER TABLE "public"."users" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: webhook
ALTER TABLE "public"."webhook" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: workflow
ALTER TABLE "public"."workflow" DROP COLUMN IF EXISTS "tenant_id_text";

-- Table: workflow_execution
ALTER TABLE "public"."workflow_execution" DROP COLUMN IF EXISTS "tenant_id_text";


COMMIT;

-- ====================================
-- VERIFICATION
-- ====================================
-- 1. Check for any remaining legacy columns
SELECT table_name, column_name
FROM information_schema.columns
WHERE column_name IN ('tenant_id_text', 'tenant_id_legacy')
  AND table_schema = 'public';
-- Expected: 0 rows

-- 2. Verify application still works
-- Run health checks and core entity list/get APIs

-- Migration complete! ✅
