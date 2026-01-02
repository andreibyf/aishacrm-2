-- Migration 110: Replace Legacy Tenant ID Indexes
-- ==================================================================
-- Purpose: Replace tenant_id_text/tenant_id_legacy indexes with tenant_id (UUID)
-- Context: Phase 2 of legacy tenant ID cleanup plan
-- Impact: ~78 indexes will be recreated
-- 
-- This migration:
-- 1. Drops old indexes using tenant_id_text or tenant_id_legacy
-- 2. Creates new indexes using tenant_id (UUID)
-- 3. Uses CREATE INDEX CONCURRENTLY to avoid table locks
-- 
-- Deployment: Apply during low-traffic window (recommended: 2am-5am UTC)
-- Rollback: See TENANT_ID_CLEANUP_PLAN.md Phase 2 rollback section

BEGIN;

-- Prevent other migrations from running concurrently
SET lock_timeout = '10s';


-- ====================================
-- ACCOUNTS (3 indexes)
-- ====================================

-- Drop legacy index: idx_accounts_assigned_to
DROP INDEX IF EXISTS "idx_accounts_assigned_to";

-- Create UUID-based index: idx_accounts_assigned_to
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_accounts_assigned_to" ON "public"."accounts" USING btree ("tenant_id", "assigned_to");

-- Drop legacy index: idx_accounts_tenant
DROP INDEX IF EXISTS "idx_accounts_tenant";

-- Create UUID-based index: idx_accounts_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_accounts_tenant_uuid" ON "public"."accounts" USING btree ("tenant_id");

-- Drop legacy index: idx_accounts_type
DROP INDEX IF EXISTS "idx_accounts_type";

-- Create UUID-based index: idx_accounts_type
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_accounts_type" ON "public"."accounts" USING btree ("tenant_id", "type");


-- ====================================
-- ACTIVITIES (12 indexes)
-- ====================================

-- Drop legacy index: idx_activities_assigned_to
DROP INDEX IF EXISTS "idx_activities_assigned_to";

-- Create UUID-based index: idx_activities_assigned_to
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_assigned_to" ON "public"."activities" USING btree ("tenant_id", "assigned_to");

-- Drop legacy index: idx_activities_created_by
DROP INDEX IF EXISTS "idx_activities_created_by";

-- Create UUID-based index: idx_activities_created_by
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_created_by" ON "public"."activities" USING btree ("tenant_id", "created_by");

-- Drop legacy index: idx_activities_created_date
DROP INDEX IF EXISTS "idx_activities_created_date";

-- Create UUID-based index: idx_activities_created_date
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_created_date" ON "public"."activities" USING btree ("tenant_id", "created_date" DESC);

-- Drop legacy index: idx_activities_due_date
DROP INDEX IF EXISTS "idx_activities_due_date";

-- Create UUID-based index: idx_activities_due_date
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_due_date" ON "public"."activities" USING btree ("tenant_id", "due_date") WHERE ("due_date" IS NOT NULL);

-- Drop legacy index: idx_activities_duration
DROP INDEX IF EXISTS "idx_activities_duration";

-- Create UUID-based index: idx_activities_duration
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_duration" ON "public"."activities" USING btree ("tenant_id", "duration_minutes") WHERE ("duration_minutes" IS NOT NULL);

-- Drop legacy index: idx_activities_priority
DROP INDEX IF EXISTS "idx_activities_priority";

-- Create UUID-based index: idx_activities_priority
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_priority" ON "public"."activities" USING btree ("tenant_id", "priority") WHERE ("priority" = ANY (ARRAY['high'::"public"."activity_priority", 'urgent'::"public"."activity_priority"]));

-- Drop legacy index: idx_activities_related_email
DROP INDEX IF EXISTS "idx_activities_related_email";

-- Create UUID-based index: idx_activities_related_email
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_related_email" ON "public"."activities" USING btree ("tenant_id", "related_email") WHERE ("related_email" IS NOT NULL);

-- Drop legacy index: idx_activities_related_name
DROP INDEX IF EXISTS "idx_activities_related_name";

-- Create UUID-based index: idx_activities_related_name
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_related_name" ON "public"."activities" USING btree ("tenant_id", "related_name") WHERE ("related_name" IS NOT NULL);

-- Drop legacy index: idx_activities_tenant
DROP INDEX IF EXISTS "idx_activities_tenant";

-- Create UUID-based index: idx_activities_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_tenant_uuid" ON "public"."activities" USING btree ("tenant_id");

-- Drop legacy index: idx_activities_tenant_created_at
DROP INDEX IF EXISTS "idx_activities_tenant_created_at";

-- Create UUID-based index: idx_activities_tenant_uuid_created_at
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_tenant_uuid_created_at" ON "public"."activities" USING btree ("tenant_id", "created_at" DESC);

-- Drop legacy index: idx_activities_tenant_created_date
DROP INDEX IF EXISTS "idx_activities_tenant_created_date";

-- Create UUID-based index: idx_activities_tenant_uuid_created_date
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_tenant_uuid_created_date" ON "public"."activities" USING btree ("tenant_id", "created_date");

-- Drop legacy index: idx_activities_updated_date
DROP INDEX IF EXISTS "idx_activities_updated_date";

-- Create UUID-based index: idx_activities_updated_date
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_activities_updated_date" ON "public"."activities" USING btree ("tenant_id", "updated_date" DESC);


-- ====================================
-- AI_CAMPAIGN (1 indexes)
-- ====================================

-- Drop legacy index: idx_ai_campaign_tenant
DROP INDEX IF EXISTS "idx_ai_campaign_tenant";

-- Create UUID-based index: idx_ai_campaign_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_ai_campaign_tenant_uuid" ON "public"."ai_campaign" USING btree ("tenant_id");


-- ====================================
-- API_KEY (1 indexes)
-- ====================================

-- Drop legacy index: idx_api_key_tenant
DROP INDEX IF EXISTS "idx_api_key_tenant";

-- Create UUID-based index: idx_api_key_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_api_key_tenant_uuid" ON "public"."api_key" USING btree ("tenant_id");


-- ====================================
-- APIKEY (1 indexes)
-- ====================================

-- Drop legacy index: idx_apikey_tenant
DROP INDEX IF EXISTS "idx_apikey_tenant";

-- Create UUID-based index: idx_apikey_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_apikey_tenant_uuid" ON "public"."apikey" USING btree ("tenant_id");


-- ====================================
-- ARCHIVE_INDEX (1 indexes)
-- ====================================

-- Drop legacy index: idx_archive_index_tenant
DROP INDEX IF EXISTS "idx_archive_index_tenant";

-- Create UUID-based index: idx_archive_index_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_archive_index_tenant_uuid" ON "public"."archive_index" USING btree ("tenant_id", "entity_type");


-- ====================================
-- AUDIT_LOG (2 indexes)
-- ====================================

-- Drop legacy index: idx_audit_log_tenant
DROP INDEX IF EXISTS "idx_audit_log_tenant";

-- Create UUID-based index: idx_audit_log_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_audit_log_tenant_uuid" ON "public"."audit_log" USING btree ("tenant_id");

-- Drop legacy index: idx_audit_log_user
DROP INDEX IF EXISTS "idx_audit_log_user";

-- Create UUID-based index: idx_audit_log_user
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_audit_log_user" ON "public"."audit_log" USING btree ("tenant_id", "user_email");


-- ====================================
-- BIZDEV_SOURCE (1 indexes)
-- ====================================

-- Drop legacy index: idx_bizdev_source_tenant
DROP INDEX IF EXISTS "idx_bizdev_source_tenant";

-- Create UUID-based index: idx_bizdev_source_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_bizdev_source_tenant_uuid" ON "public"."bizdev_source" USING btree ("tenant_id");


-- ====================================
-- BIZDEV_SOURCES (1 indexes)
-- ====================================

-- Drop legacy index: idx_bizdev_sources_tenant
DROP INDEX IF EXISTS "idx_bizdev_sources_tenant";

-- Create UUID-based index: idx_bizdev_sources_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_bizdev_sources_tenant_uuid" ON "public"."bizdev_sources" USING btree ("tenant_id");


-- ====================================
-- CASH_FLOW (2 indexes)
-- ====================================

-- Drop legacy index: idx_cash_flow_date
DROP INDEX IF EXISTS "idx_cash_flow_date";

-- Create UUID-based index: idx_cash_flow_date
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_cash_flow_date" ON "public"."cash_flow" USING btree ("tenant_id", "transaction_date");

-- Drop legacy index: idx_cash_flow_tenant
DROP INDEX IF EXISTS "idx_cash_flow_tenant";

-- Create UUID-based index: idx_cash_flow_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_cash_flow_tenant_uuid" ON "public"."cash_flow" USING btree ("tenant_id");


-- ====================================
-- CHECKPOINT (1 indexes)
-- ====================================

-- Drop legacy index: idx_checkpoint_tenant
DROP INDEX IF EXISTS "idx_checkpoint_tenant";

-- Create UUID-based index: idx_checkpoint_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_checkpoint_tenant_uuid" ON "public"."checkpoint" USING btree ("tenant_id", "entity_type", "entity_id");


-- ====================================
-- CLIENT_REQUIREMENT (1 indexes)
-- ====================================

-- Drop legacy index: idx_client_requirement_tenant
DROP INDEX IF EXISTS "idx_client_requirement_tenant";

-- Create UUID-based index: idx_client_requirement_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_client_requirement_tenant_uuid" ON "public"."client_requirement" USING btree ("tenant_id");


-- ====================================
-- CONTACTS (4 indexes)
-- ====================================

-- Drop legacy index: idx_contacts_assigned_to
DROP INDEX IF EXISTS "idx_contacts_assigned_to";

-- Create UUID-based index: idx_contacts_assigned_to
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_contacts_assigned_to" ON "public"."contacts" USING btree ("tenant_id", "assigned_to") WHERE ("assigned_to" IS NOT NULL);

-- Drop legacy index: idx_contacts_job_title
DROP INDEX IF EXISTS "idx_contacts_job_title";

-- Create UUID-based index: idx_contacts_job_title
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_contacts_job_title" ON "public"."contacts" USING btree ("tenant_id", "job_title") WHERE ("job_title" IS NOT NULL);

-- Drop legacy index: idx_contacts_status
DROP INDEX IF EXISTS "idx_contacts_status";

-- Create UUID-based index: idx_contacts_status
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_contacts_status" ON "public"."contacts" USING btree ("tenant_id", "status");

-- Drop legacy index: idx_contacts_tenant
DROP INDEX IF EXISTS "idx_contacts_tenant";

-- Create UUID-based index: idx_contacts_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_contacts_tenant_uuid" ON "public"."contacts" USING btree ("tenant_id");


-- ====================================
-- DAILY_SALES_METRICS (1 indexes)
-- ====================================

-- Drop legacy index: idx_daily_sales_metrics_tenant
DROP INDEX IF EXISTS "idx_daily_sales_metrics_tenant";

-- Create UUID-based index: idx_daily_sales_metrics_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_daily_sales_metrics_tenant_uuid" ON "public"."daily_sales_metrics" USING btree ("tenant_id", "metric_date");


-- ====================================
-- EMAIL_TEMPLATE (1 indexes)
-- ====================================

-- Drop legacy index: idx_email_template_tenant
DROP INDEX IF EXISTS "idx_email_template_tenant";

-- Create UUID-based index: idx_email_template_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_email_template_tenant_uuid" ON "public"."email_template" USING btree ("tenant_id");


-- ====================================
-- EMPLOYEES (2 indexes)
-- ====================================

-- Drop legacy index: idx_employees_is_test_data
DROP INDEX IF EXISTS "idx_employees_is_test_data";

-- Create UUID-based index: idx_employees_is_test_data
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_employees_is_test_data" ON "public"."employees" USING btree ("tenant_id", "is_test_data") WHERE ("is_test_data" = true);

-- Drop legacy index: idx_employees_tenant
DROP INDEX IF EXISTS "idx_employees_tenant";

-- Create UUID-based index: idx_employees_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_employees_tenant_uuid" ON "public"."employees" USING btree ("tenant_id");


-- ====================================
-- FIELD_CUSTOMIZATION (1 indexes)
-- ====================================

-- Drop legacy index: idx_field_customization_tenant
DROP INDEX IF EXISTS "idx_field_customization_tenant";

-- Create UUID-based index: idx_field_customization_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_field_customization_tenant_uuid" ON "public"."field_customization" USING btree ("tenant_id", "entity_type");


-- ====================================
-- FILE (2 indexes)
-- ====================================

-- Drop legacy index: idx_file_related
DROP INDEX IF EXISTS "idx_file_related";

-- Create UUID-based index: idx_file_related
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_file_related" ON "public"."file" USING btree ("tenant_id", "related_type", "related_id");

-- Drop legacy index: idx_file_tenant
DROP INDEX IF EXISTS "idx_file_tenant";

-- Create UUID-based index: idx_file_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_file_tenant_uuid" ON "public"."file" USING btree ("tenant_id");


-- ====================================
-- IMPORT_LOG (1 indexes)
-- ====================================

-- Drop legacy index: idx_import_log_tenant
DROP INDEX IF EXISTS "idx_import_log_tenant";

-- Create UUID-based index: idx_import_log_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_import_log_tenant_uuid" ON "public"."import_log" USING btree ("tenant_id");


-- ====================================
-- LEADS (8 indexes)
-- ====================================

-- Drop legacy index: idx_leads_assigned_to
DROP INDEX IF EXISTS "idx_leads_assigned_to";

-- Create UUID-based index: idx_leads_assigned_to
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_assigned_to" ON "public"."leads" USING btree ("tenant_id", "assigned_to") WHERE ("assigned_to" IS NOT NULL);

-- Drop legacy index: idx_leads_do_not_call
DROP INDEX IF EXISTS "idx_leads_do_not_call";

-- Create UUID-based index: idx_leads_do_not_call
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_do_not_call" ON "public"."leads" USING btree ("tenant_id", "do_not_call") WHERE ("do_not_call" = true);

-- Drop legacy index: idx_leads_do_not_text
DROP INDEX IF EXISTS "idx_leads_do_not_text";

-- Create UUID-based index: idx_leads_do_not_text
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_do_not_text" ON "public"."leads" USING btree ("tenant_id", "do_not_text") WHERE ("do_not_text" = true);

-- Drop legacy index: idx_leads_job_title
DROP INDEX IF EXISTS "idx_leads_job_title";

-- Create UUID-based index: idx_leads_job_title
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_job_title" ON "public"."leads" USING btree ("tenant_id", "job_title");

-- Drop legacy index: idx_leads_status
DROP INDEX IF EXISTS "idx_leads_status";

-- Create UUID-based index: idx_leads_status
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_status" ON "public"."leads" USING btree ("tenant_id", "status");

-- Drop legacy index: idx_leads_tenant
DROP INDEX IF EXISTS "idx_leads_tenant";

-- Create UUID-based index: idx_leads_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_tenant_uuid" ON "public"."leads" USING btree ("tenant_id");

-- Drop legacy index: idx_leads_tenant_created_date
DROP INDEX IF EXISTS "idx_leads_tenant_created_date";

-- Create UUID-based index: idx_leads_tenant_uuid_created_date
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_tenant_uuid_created_date" ON "public"."leads" USING btree ("tenant_id", "created_date");

-- Drop legacy index: idx_leads_tenant_status
DROP INDEX IF EXISTS "idx_leads_tenant_status";

-- Create UUID-based index: idx_leads_tenant_uuid_status
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_leads_tenant_uuid_status" ON "public"."leads" USING btree ("tenant_id", "status");


-- ====================================
-- MODULESETTINGS (1 indexes)
-- ====================================

-- Drop legacy index: idx_modulesettings_tenant
DROP INDEX IF EXISTS "idx_modulesettings_tenant";

-- Create UUID-based index: idx_modulesettings_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_modulesettings_tenant_uuid" ON "public"."modulesettings" USING btree ("tenant_id");


-- ====================================
-- NOTE (2 indexes)
-- ====================================

-- Drop legacy index: idx_note_related
DROP INDEX IF EXISTS "idx_note_related";

-- Create UUID-based index: idx_note_related
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_note_related" ON "public"."note" USING btree ("tenant_id", "related_type", "related_id");

-- Drop legacy index: idx_note_tenant
DROP INDEX IF EXISTS "idx_note_tenant";

-- Create UUID-based index: idx_note_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_note_tenant_uuid" ON "public"."note" USING btree ("tenant_id");


-- ====================================
-- NOTIFICATIONS (2 indexes)
-- ====================================

-- Drop legacy index: idx_notifications_tenant
DROP INDEX IF EXISTS "idx_notifications_tenant";

-- Create UUID-based index: idx_notifications_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_notifications_tenant_uuid" ON "public"."notifications" USING btree ("tenant_id");

-- Drop legacy index: idx_notifications_user
DROP INDEX IF EXISTS "idx_notifications_user";

-- Create UUID-based index: idx_notifications_user
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_notifications_user" ON "public"."notifications" USING btree ("tenant_id", "user_email");


-- ====================================
-- OPPORTUNITIES (7 indexes)
-- ====================================

-- Drop legacy index: idx_opportunities_lead_id
DROP INDEX IF EXISTS "idx_opportunities_lead_id";

-- Create UUID-based index: idx_opportunities_lead_id
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_lead_id" ON "public"."opportunities" USING btree ("tenant_id", "lead_id");

-- Drop legacy index: idx_opportunities_source
DROP INDEX IF EXISTS "idx_opportunities_source";

-- Create UUID-based index: idx_opportunities_source
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_source" ON "public"."opportunities" USING btree ("tenant_id", "source") WHERE ("source" IS NOT NULL);

-- Drop legacy index: idx_opportunities_tenant
DROP INDEX IF EXISTS "idx_opportunities_tenant";

-- Create UUID-based index: idx_opportunities_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_tenant_uuid" ON "public"."opportunities" USING btree ("tenant_id");

-- Drop legacy index: idx_opportunities_tenant_stage
DROP INDEX IF EXISTS "idx_opportunities_tenant_stage";

-- Create UUID-based index: idx_opportunities_tenant_uuid_stage
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_tenant_uuid_stage" ON "public"."opportunities" USING btree ("tenant_id", "stage");

-- Drop legacy index: idx_opportunities_tenant_stage_won
DROP INDEX IF EXISTS "idx_opportunities_tenant_stage_won";

-- Create UUID-based index: idx_opportunities_tenant_uuid_stage_won
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_tenant_uuid_stage_won" ON "public"."opportunities" USING btree ("tenant_id") WHERE ("stage" = ANY (ARRAY['won'::"text", 'closed_won'::"text"]));

-- Drop legacy index: idx_opportunities_tenant_updated_at
DROP INDEX IF EXISTS "idx_opportunities_tenant_updated_at";

-- Create UUID-based index: idx_opportunities_tenant_uuid_updated_at
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_tenant_uuid_updated_at" ON "public"."opportunities" USING btree ("tenant_id", "updated_at" DESC);

-- Drop legacy index: idx_opportunities_type
DROP INDEX IF EXISTS "idx_opportunities_type";

-- Create UUID-based index: idx_opportunities_type
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_opportunities_type" ON "public"."opportunities" USING btree ("tenant_id", "type") WHERE ("type" IS NOT NULL);


-- ====================================
-- PERFORMANCE_LOG (1 indexes)
-- ====================================

-- Drop legacy index: idx_performance_log_tenant
DROP INDEX IF EXISTS "idx_performance_log_tenant";

-- Create UUID-based index: idx_performance_log_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_performance_log_tenant_uuid" ON "public"."performance_log" USING btree ("tenant_id");


-- ====================================
-- PERFORMANCE_LOGS (3 indexes)
-- ====================================

-- Drop legacy index: idx_perflogs_tenant_id
DROP INDEX IF EXISTS "idx_perflogs_tenant_id";

-- Create UUID-based index: idx_perflogs_tenant_uuid_id
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_perflogs_tenant_uuid_id" ON "public"."performance_logs" USING btree ("tenant_id");

-- Drop legacy index: idx_performance_logs_tenant
DROP INDEX IF EXISTS "idx_performance_logs_tenant";

-- Create UUID-based index: idx_performance_logs_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_performance_logs_tenant_uuid" ON "public"."performance_logs" USING btree ("tenant_id");

-- Drop legacy index: idx_performance_logs_tenant_created
DROP INDEX IF EXISTS "idx_performance_logs_tenant_created";

-- Create UUID-based index: idx_performance_logs_tenant_uuid_created
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_performance_logs_tenant_uuid_created" ON "public"."performance_logs" USING btree ("tenant_id", "created_at" DESC);


-- ====================================
-- SYNCHEALTH (1 indexes)
-- ====================================

-- Drop legacy index: idx_synchealth_tenant
DROP INDEX IF EXISTS "idx_synchealth_tenant";

-- Create UUID-based index: idx_synchealth_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_synchealth_tenant_uuid" ON "public"."synchealth" USING btree ("tenant_id");


-- ====================================
-- SYSTEM_LOGS (3 indexes)
-- ====================================

-- Drop legacy index: idx_system_logs_level
DROP INDEX IF EXISTS "idx_system_logs_level";

-- Create UUID-based index: idx_system_logs_level
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_system_logs_level" ON "public"."system_logs" USING btree ("tenant_id", "level");

-- Drop legacy index: idx_system_logs_tenant
DROP INDEX IF EXISTS "idx_system_logs_tenant";

-- Create UUID-based index: idx_system_logs_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_system_logs_tenant_uuid" ON "public"."system_logs" USING btree ("tenant_id");

-- Drop legacy index: idx_system_logs_user
DROP INDEX IF EXISTS "idx_system_logs_user";

-- Create UUID-based index: idx_system_logs_user
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_system_logs_user" ON "public"."system_logs" USING btree ("tenant_id", "user_email");


-- ====================================
-- SYSTEMBRANDING (1 indexes)
-- ====================================

-- Drop legacy index: idx_systembranding_tenant
DROP INDEX IF EXISTS "idx_systembranding_tenant";

-- Create UUID-based index: idx_systembranding_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_systembranding_tenant_uuid" ON "public"."systembranding" USING btree ("tenant_id");


-- ====================================
-- TENANT_INTEGRATION (1 indexes)
-- ====================================

-- Drop legacy index: idx_tenant_integration_tenant
DROP INDEX IF EXISTS "idx_tenant_integration_tenant";

-- Create UUID-based index: idx_tenant_uuid_integration_tenant
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_tenant_uuid_integration_tenant" ON "public"."tenant_integration" USING btree ("tenant_id");


-- ====================================
-- TENANT_INTEGRATIONS (3 indexes)
-- ====================================

-- Drop legacy index: idx_tenant_integrations_active
DROP INDEX IF EXISTS "idx_tenant_integrations_active";

-- Create UUID-based index: idx_tenant_uuid_integrations_active
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_tenant_uuid_integrations_active" ON "public"."tenant_integrations" USING btree ("tenant_id", "is_active");

-- Drop legacy index: idx_tenant_integrations_tenant
DROP INDEX IF EXISTS "idx_tenant_integrations_tenant";

-- Create UUID-based index: idx_tenant_uuid_integrations_tenant
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_tenant_uuid_integrations_tenant" ON "public"."tenant_integrations" USING btree ("tenant_id");

-- Drop legacy index: idx_tenant_integrations_type
DROP INDEX IF EXISTS "idx_tenant_integrations_type";

-- Create UUID-based index: idx_tenant_uuid_integrations_type
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_tenant_uuid_integrations_type" ON "public"."tenant_integrations" USING btree ("tenant_id", "integration_type");


-- ====================================
-- TEST_REPORT (1 indexes)
-- ====================================

-- Drop legacy index: idx_test_report_tenant
DROP INDEX IF EXISTS "idx_test_report_tenant";

-- Create UUID-based index: idx_test_report_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_test_report_tenant_uuid" ON "public"."test_report" USING btree ("tenant_id");


-- ====================================
-- USER_INVITATION (1 indexes)
-- ====================================

-- Drop legacy index: idx_user_invitation_tenant
DROP INDEX IF EXISTS "idx_user_invitation_tenant";

-- Create UUID-based index: idx_user_invitation_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_user_invitation_tenant_uuid" ON "public"."user_invitation" USING btree ("tenant_id");


-- ====================================
-- USERS (1 indexes)
-- ====================================

-- Drop legacy index: idx_users_tenant_id
DROP INDEX IF EXISTS "idx_users_tenant_id";

-- Create UUID-based index: idx_users_tenant_uuid_id
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_users_tenant_uuid_id" ON "public"."users" USING btree ("tenant_id");


-- ====================================
-- WEBHOOK (1 indexes)
-- ====================================

-- Drop legacy index: idx_webhook_tenant
DROP INDEX IF EXISTS "idx_webhook_tenant";

-- Create UUID-based index: idx_webhook_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_webhook_tenant_uuid" ON "public"."webhook" USING btree ("tenant_id");


-- ====================================
-- WORKFLOW (1 indexes)
-- ====================================

-- Drop legacy index: idx_workflow_tenant
DROP INDEX IF EXISTS "idx_workflow_tenant";

-- Create UUID-based index: idx_workflow_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_workflow_tenant_uuid" ON "public"."workflow" USING btree ("tenant_id");


-- ====================================
-- WORKFLOW_EXECUTION (1 indexes)
-- ====================================

-- Drop legacy index: idx_workflow_execution_tenant
DROP INDEX IF EXISTS "idx_workflow_execution_tenant";

-- Create UUID-based index: idx_workflow_execution_tenant_uuid
-- Note: This will be created CONCURRENTLY in post-transaction step
-- CREATE INDEX CONCURRENTLY "idx_workflow_execution_tenant_uuid" ON "public"."workflow_execution" USING btree ("tenant_id");


COMMIT;

-- ====================================
-- POST-TRANSACTION INDEX CREATION
-- ====================================
-- The following indexes must be created OUTSIDE the transaction
-- using CREATE INDEX CONCURRENTLY to avoid table locks.
-- 
-- Run these statements one at a time, monitoring for completion:


-- accounts
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_accounts_assigned_to" ON "public"."accounts" USING btree ("tenant_id", "assigned_to");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_accounts_tenant_uuid" ON "public"."accounts" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_accounts_type" ON "public"."accounts" USING btree ("tenant_id", "type");

-- activities
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_assigned_to" ON "public"."activities" USING btree ("tenant_id", "assigned_to");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_created_by" ON "public"."activities" USING btree ("tenant_id", "created_by");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_created_date" ON "public"."activities" USING btree ("tenant_id", "created_date" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_due_date" ON "public"."activities" USING btree ("tenant_id", "due_date") WHERE ("due_date" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_duration" ON "public"."activities" USING btree ("tenant_id", "duration_minutes") WHERE ("duration_minutes" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_priority" ON "public"."activities" USING btree ("tenant_id", "priority") WHERE ("priority" = ANY (ARRAY['high'::"public"."activity_priority", 'urgent'::"public"."activity_priority"]));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_related_email" ON "public"."activities" USING btree ("tenant_id", "related_email") WHERE ("related_email" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_related_name" ON "public"."activities" USING btree ("tenant_id", "related_name") WHERE ("related_name" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_tenant_uuid" ON "public"."activities" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_tenant_uuid_created_at" ON "public"."activities" USING btree ("tenant_id", "created_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_tenant_uuid_created_date" ON "public"."activities" USING btree ("tenant_id", "created_date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_activities_updated_date" ON "public"."activities" USING btree ("tenant_id", "updated_date" DESC);

-- ai_campaign
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_ai_campaign_tenant_uuid" ON "public"."ai_campaign" USING btree ("tenant_id");

-- api_key
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_api_key_tenant_uuid" ON "public"."api_key" USING btree ("tenant_id");

-- apikey
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_apikey_tenant_uuid" ON "public"."apikey" USING btree ("tenant_id");

-- archive_index
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_archive_index_tenant_uuid" ON "public"."archive_index" USING btree ("tenant_id", "entity_type");

-- audit_log
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_tenant_uuid" ON "public"."audit_log" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_audit_log_user" ON "public"."audit_log" USING btree ("tenant_id", "user_email");

-- bizdev_source
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_bizdev_source_tenant_uuid" ON "public"."bizdev_source" USING btree ("tenant_id");

-- bizdev_sources
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_bizdev_sources_tenant_uuid" ON "public"."bizdev_sources" USING btree ("tenant_id");

-- cash_flow
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cash_flow_date" ON "public"."cash_flow" USING btree ("tenant_id", "transaction_date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_cash_flow_tenant_uuid" ON "public"."cash_flow" USING btree ("tenant_id");

-- checkpoint
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_checkpoint_tenant_uuid" ON "public"."checkpoint" USING btree ("tenant_id", "entity_type", "entity_id");

-- client_requirement
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_client_requirement_tenant_uuid" ON "public"."client_requirement" USING btree ("tenant_id");

-- contacts
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contacts_assigned_to" ON "public"."contacts" USING btree ("tenant_id", "assigned_to") WHERE ("assigned_to" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contacts_job_title" ON "public"."contacts" USING btree ("tenant_id", "job_title") WHERE ("job_title" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contacts_status" ON "public"."contacts" USING btree ("tenant_id", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_contacts_tenant_uuid" ON "public"."contacts" USING btree ("tenant_id");

-- daily_sales_metrics
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_daily_sales_metrics_tenant_uuid" ON "public"."daily_sales_metrics" USING btree ("tenant_id", "metric_date");

-- email_template
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_email_template_tenant_uuid" ON "public"."email_template" USING btree ("tenant_id");

-- employees
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_employees_is_test_data" ON "public"."employees" USING btree ("tenant_id", "is_test_data") WHERE ("is_test_data" = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_employees_tenant_uuid" ON "public"."employees" USING btree ("tenant_id");

-- field_customization
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_field_customization_tenant_uuid" ON "public"."field_customization" USING btree ("tenant_id", "entity_type");

-- file
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_file_related" ON "public"."file" USING btree ("tenant_id", "related_type", "related_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_file_tenant_uuid" ON "public"."file" USING btree ("tenant_id");

-- import_log
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_import_log_tenant_uuid" ON "public"."import_log" USING btree ("tenant_id");

-- leads
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_assigned_to" ON "public"."leads" USING btree ("tenant_id", "assigned_to") WHERE ("assigned_to" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_do_not_call" ON "public"."leads" USING btree ("tenant_id", "do_not_call") WHERE ("do_not_call" = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_do_not_text" ON "public"."leads" USING btree ("tenant_id", "do_not_text") WHERE ("do_not_text" = true);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_job_title" ON "public"."leads" USING btree ("tenant_id", "job_title");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_status" ON "public"."leads" USING btree ("tenant_id", "status");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_tenant_uuid" ON "public"."leads" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_tenant_uuid_created_date" ON "public"."leads" USING btree ("tenant_id", "created_date");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_leads_tenant_uuid_status" ON "public"."leads" USING btree ("tenant_id", "status");

-- modulesettings
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_modulesettings_tenant_uuid" ON "public"."modulesettings" USING btree ("tenant_id");

-- note
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_note_related" ON "public"."note" USING btree ("tenant_id", "related_type", "related_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_note_tenant_uuid" ON "public"."note" USING btree ("tenant_id");

-- notifications
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_tenant_uuid" ON "public"."notifications" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_notifications_user" ON "public"."notifications" USING btree ("tenant_id", "user_email");

-- opportunities
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_lead_id" ON "public"."opportunities" USING btree ("tenant_id", "lead_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_source" ON "public"."opportunities" USING btree ("tenant_id", "source") WHERE ("source" IS NOT NULL);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_tenant_uuid" ON "public"."opportunities" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_tenant_uuid_stage" ON "public"."opportunities" USING btree ("tenant_id", "stage");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_tenant_uuid_stage_won" ON "public"."opportunities" USING btree ("tenant_id") WHERE ("stage" = ANY (ARRAY['won'::"text", 'closed_won'::"text"]));
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_tenant_uuid_updated_at" ON "public"."opportunities" USING btree ("tenant_id", "updated_at" DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_opportunities_type" ON "public"."opportunities" USING btree ("tenant_id", "type") WHERE ("type" IS NOT NULL);

-- performance_log
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_performance_log_tenant_uuid" ON "public"."performance_log" USING btree ("tenant_id");

-- performance_logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_perflogs_tenant_uuid_id" ON "public"."performance_logs" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_performance_logs_tenant_uuid" ON "public"."performance_logs" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_performance_logs_tenant_uuid_created" ON "public"."performance_logs" USING btree ("tenant_id", "created_at" DESC);

-- synchealth
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_synchealth_tenant_uuid" ON "public"."synchealth" USING btree ("tenant_id");

-- system_logs
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_logs_level" ON "public"."system_logs" USING btree ("tenant_id", "level");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_logs_tenant_uuid" ON "public"."system_logs" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_system_logs_user" ON "public"."system_logs" USING btree ("tenant_id", "user_email");

-- systembranding
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_systembranding_tenant_uuid" ON "public"."systembranding" USING btree ("tenant_id");

-- tenant_integration
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tenant_uuid_integration_tenant" ON "public"."tenant_integration" USING btree ("tenant_id");

-- tenant_integrations
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tenant_uuid_integrations_active" ON "public"."tenant_integrations" USING btree ("tenant_id", "is_active");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tenant_uuid_integrations_tenant" ON "public"."tenant_integrations" USING btree ("tenant_id");
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_tenant_uuid_integrations_type" ON "public"."tenant_integrations" USING btree ("tenant_id", "integration_type");

-- test_report
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_test_report_tenant_uuid" ON "public"."test_report" USING btree ("tenant_id");

-- user_invitation
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_user_invitation_tenant_uuid" ON "public"."user_invitation" USING btree ("tenant_id");

-- users
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_users_tenant_uuid_id" ON "public"."users" USING btree ("tenant_id");

-- webhook
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_webhook_tenant_uuid" ON "public"."webhook" USING btree ("tenant_id");

-- workflow
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_workflow_tenant_uuid" ON "public"."workflow" USING btree ("tenant_id");

-- workflow_execution
CREATE INDEX CONCURRENTLY IF NOT EXISTS "idx_workflow_execution_tenant_uuid" ON "public"."workflow_execution" USING btree ("tenant_id");

-- ====================================
-- VERIFICATION
-- ====================================
-- Run these queries to verify migration success:

-- 1. Check for remaining legacy indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexdef LIKE '%tenant_id_text%'
   OR indexdef LIKE '%tenant_id_legacy%'
ORDER BY tablename, indexname;
-- Expected: 0 rows

-- 2. Check for new UUID indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexdef LIKE '%tenant_id%'
  AND indexdef NOT LIKE '%tenant_id_text%'
  AND indexdef NOT LIKE '%tenant_id_legacy%'
ORDER BY tablename, indexname;
-- Expected: 78+ rows

-- 3. Verify index usage (sample query)
EXPLAIN ANALYZE SELECT * FROM accounts WHERE tenant_id = '<uuid>';
-- Should use: Index Scan using idx_accounts_tenant_uuid

-- Migration complete! ✅
