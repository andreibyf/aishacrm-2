-- Migration 111: Replace Legacy Tenant ID RLS Policies
-- ==================================================================
-- Purpose: Replace tenant_id_text/tenant_id_legacy RLS policies with tenant_id (UUID)
-- Context: Phase 3 of legacy tenant ID cleanup plan
-- Impact: 13 RLS policies will be recreated
-- Security: CRITICAL - ensures tenant isolation uses correct UUID column
-- 
-- This migration:
-- 1. Drops old RLS policies using tenant_id_text or tenant_id_legacy
-- 2. Creates new RLS policies using tenant_id (UUID)
-- 3. Preserves superadmin bypass logic
-- 4. Ensures proper tenant isolation
-- 
-- Deployment: Apply during low-traffic window (recommended: 2am-5am UTC)
-- Rollback: See TENANT_ID_CLEANUP_PLAN.md Phase 3 rollback section

BEGIN;

-- Prevent other migrations from running concurrently
SET lock_timeout = '10s';


-- ====================================
-- ACTIVITIES (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_activities
DROP POLICY IF EXISTS "tenant_isolation_activities" ON "public"."activities";

-- Create UUID-based policy: tenant_isolation_activities
CREATE POLICY "tenant_isolation_activities" ON "public"."activities"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- BIZDEV_SOURCE (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_bizdev_source
DROP POLICY IF EXISTS "tenant_isolation_bizdev_source" ON "public"."bizdev_source";

-- Create UUID-based policy: tenant_isolation_bizdev_source
CREATE POLICY "tenant_isolation_bizdev_source" ON "public"."bizdev_source"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- CASH_FLOW (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_cash_flow
DROP POLICY IF EXISTS "tenant_isolation_cash_flow" ON "public"."cash_flow";

-- Create UUID-based policy: tenant_isolation_cash_flow
CREATE POLICY "tenant_isolation_cash_flow" ON "public"."cash_flow"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- CLIENT_REQUIREMENT (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_client_requirement
DROP POLICY IF EXISTS "tenant_isolation_client_requirement" ON "public"."client_requirement";

-- Create UUID-based policy: tenant_isolation_client_requirement
CREATE POLICY "tenant_isolation_client_requirement" ON "public"."client_requirement"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- CONTACTS (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_contacts
DROP POLICY IF EXISTS "tenant_isolation_contacts" ON "public"."contacts";

-- Create UUID-based policy: tenant_isolation_contacts
CREATE POLICY "tenant_isolation_contacts" ON "public"."contacts"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- LEADS (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_leads
DROP POLICY IF EXISTS "tenant_isolation_leads" ON "public"."leads";

-- Create UUID-based policy: tenant_isolation_leads
CREATE POLICY "tenant_isolation_leads" ON "public"."leads"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- NOTE (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_note
DROP POLICY IF EXISTS "tenant_isolation_note" ON "public"."note";

-- Create UUID-based policy: tenant_isolation_note
CREATE POLICY "tenant_isolation_note" ON "public"."note"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- NOTIFICATIONS (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_notifications
DROP POLICY IF EXISTS "tenant_isolation_notifications" ON "public"."notifications";

-- Create UUID-based policy: tenant_isolation_notifications
CREATE POLICY "tenant_isolation_notifications" ON "public"."notifications"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- OPPORTUNITIES (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_opportunities
DROP POLICY IF EXISTS "tenant_isolation_opportunities" ON "public"."opportunities";

-- Create UUID-based policy: tenant_isolation_opportunities
CREATE POLICY "tenant_isolation_opportunities" ON "public"."opportunities"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- PERSON_PROFILE (1 policy)
-- ====================================

-- Drop legacy policy: tenant_insert_person_profile
DROP POLICY IF EXISTS "tenant_insert_person_profile" ON "public"."person_profile";

-- Create UUID-based policy: tenant_insert_person_profile
CREATE POLICY "tenant_insert_person_profile" ON "public"."person_profile"
  FOR INSERT
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- SYNCHEALTH (1 policy)
-- ====================================

-- Drop legacy policy: synchealth_tenant_isolation
DROP POLICY IF EXISTS "synchealth_tenant_isolation" ON "public"."synchealth";

-- Create UUID-based policy: synchealth_tenant_uuid_isolation
CREATE POLICY "synchealth_tenant_uuid_isolation" ON "public"."synchealth"
  USING (("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid())) OR (current_setting('app.bypass_rls', true) = 'true'));


-- ====================================
-- WORKFLOW (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_workflow
DROP POLICY IF EXISTS "tenant_isolation_workflow" ON "public"."workflow";

-- Create UUID-based policy: tenant_isolation_workflow
CREATE POLICY "tenant_isolation_workflow" ON "public"."workflow"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


-- ====================================
-- WORKFLOW_EXECUTION (1 policy)
-- ====================================

-- Drop legacy policy: tenant_isolation_workflow_execution
DROP POLICY IF EXISTS "tenant_isolation_workflow_execution" ON "public"."workflow_execution";

-- Create UUID-based policy: tenant_isolation_workflow_execution
CREATE POLICY "tenant_isolation_workflow_execution" ON "public"."workflow_execution"
  TO "authenticated"
  USING ("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()));


COMMIT;

-- ====================================
-- VERIFICATION
-- ====================================
-- Run these queries to verify migration success:

-- 1. Check for remaining legacy RLS policies
SELECT tablename, policyname, definition
FROM pg_policies
WHERE definition LIKE '%tenant_id_text%'
   OR definition LIKE '%tenant_id_legacy%'
ORDER BY tablename, policyname;
-- Expected: 0 rows

-- 2. Check for new UUID RLS policies
SELECT tablename, policyname, definition
FROM pg_policies
WHERE definition LIKE '%tenant_id%'
  AND definition NOT LIKE '%tenant_id_text%'
  AND definition NOT LIKE '%tenant_id_legacy%'
ORDER BY tablename, policyname;
-- Expected: 13+ rows

-- 3. Test RLS enforcement (as authenticated user)
-- Run as regular user:
SET ROLE authenticated;
SET request.jwt.claims.sub = '<user-uuid>';
SELECT COUNT(*) FROM accounts; -- Should only see own tenant
RESET ROLE;

-- 4. Test superadmin bypass (if applicable)
-- Run as superadmin:
SET ROLE authenticated;
SET request.jwt.claims.sub = '<superadmin-uuid>';
SELECT COUNT(*) FROM accounts; -- Should see all tenants
RESET ROLE;

-- Migration complete! ✅
