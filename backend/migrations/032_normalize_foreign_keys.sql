-- ========================================
-- Foreign Key Normalization Migration
-- ========================================
-- This migration converts TEXT tenant_id columns to UUID foreign keys
-- and ensures all relationships use proper foreign key constraints.
--
-- CRITICAL: This is a major schema change that affects all tables.
-- Back up your database before running this migration.
--
-- The migration:
-- 1. Creates a tenant_id → UUID mapping from the tenant table
-- 2. Adds new UUID columns for foreign keys
-- 3. Migrates data using the mapping
-- 4. Drops old TEXT columns
-- 5. Renames new columns to replace old ones
-- 6. Adds proper foreign key constraints

-- ========================================
-- STEP 1: Add new UUID foreign key columns
-- ========================================

-- Add tenant_uuid column to all tables that have tenant_id
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE activities ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE modulesettings ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE field_customization ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE note ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE subscription ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE webhook ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE test_report ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE tenant_integration ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE announcement ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE file ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE user_invitation ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE ai_campaign ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE api_key ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE cash_flow ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE cron_job ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE performance_log ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE email_template ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE checkpoint ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE contact_history ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE lead_history ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE daily_sales_metrics ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE import_log ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE bizdev_source ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE archive_index ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE client_requirement ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS tenant_uuid UUID;
ALTER TABLE workflow_execution ADD COLUMN IF NOT EXISTS tenant_uuid UUID;

-- Add tenant_uuid to users table (users can belong to a tenant)
ALTER TABLE users ADD COLUMN IF NOT EXISTS tenant_uuid UUID;

-- ========================================
-- STEP 2: Migrate data from TEXT to UUID
-- ========================================

-- Update all tables by looking up the UUID from the tenant table
UPDATE accounts SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = accounts.tenant_id);
UPDATE contacts SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = contacts.tenant_id);
UPDATE leads SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = leads.tenant_id);
UPDATE activities SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = activities.tenant_id);
UPDATE opportunities SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = opportunities.tenant_id);
UPDATE notifications SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = notifications.tenant_id);
UPDATE system_logs SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = system_logs.tenant_id);
UPDATE employees SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = employees.tenant_id);
UPDATE modulesettings SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = modulesettings.tenant_id);
UPDATE field_customization SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = field_customization.tenant_id);
UPDATE audit_log SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = audit_log.tenant_id);
UPDATE note SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = note.tenant_id);
UPDATE subscription SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = subscription.tenant_id);
UPDATE webhook SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = webhook.tenant_id);
UPDATE test_report SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = test_report.tenant_id);
UPDATE tenant_integration SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = tenant_integration.tenant_id);
UPDATE announcement SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = announcement.tenant_id) WHERE announcement.tenant_id IS NOT NULL;
UPDATE file SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = file.tenant_id);
UPDATE user_invitation SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = user_invitation.tenant_id);
UPDATE ai_campaign SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = ai_campaign.tenant_id);
UPDATE api_key SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = api_key.tenant_id);
UPDATE cash_flow SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = cash_flow.tenant_id);
UPDATE cron_job SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = cron_job.tenant_id) WHERE cron_job.tenant_id IS NOT NULL;
UPDATE performance_log SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = performance_log.tenant_id);
UPDATE email_template SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = email_template.tenant_id);
UPDATE checkpoint SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = checkpoint.tenant_id);
UPDATE contact_history SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = contact_history.tenant_id);
UPDATE lead_history SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = lead_history.tenant_id);
UPDATE daily_sales_metrics SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = daily_sales_metrics.tenant_id);
UPDATE import_log SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = import_log.tenant_id);
UPDATE bizdev_source SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = bizdev_source.tenant_id);
UPDATE archive_index SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = archive_index.tenant_id);
UPDATE client_requirement SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = client_requirement.tenant_id);
UPDATE workflow SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = workflow.tenant_id);
UPDATE workflow_execution SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = workflow_execution.tenant_id);

-- Update users table (users.tenant_id was added later)
UPDATE users SET tenant_uuid = (SELECT id FROM tenant WHERE tenant.tenant_id = users.tenant_id) WHERE users.tenant_id IS NOT NULL;

-- ========================================
-- STEP 3: Drop old TEXT tenant_id columns
-- ========================================

ALTER TABLE accounts DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE contacts DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE leads DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE activities DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE opportunities DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE notifications DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE system_logs DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE employees DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE modulesettings DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE field_customization DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE audit_log DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE note DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE subscription DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE webhook DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE test_report DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE tenant_integration DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE announcement DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE file DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE user_invitation DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE ai_campaign DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE api_key DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE cash_flow DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE cron_job DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE performance_log DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE email_template DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE checkpoint DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE contact_history DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE lead_history DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE daily_sales_metrics DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE import_log DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE bizdev_source DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE archive_index DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE client_requirement DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE workflow DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE workflow_execution DROP COLUMN IF EXISTS tenant_id;
ALTER TABLE users DROP COLUMN IF EXISTS tenant_id;

-- ========================================
-- STEP 4: Rename tenant_uuid to tenant_id
-- ========================================

ALTER TABLE accounts RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE contacts RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE leads RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE activities RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE opportunities RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE notifications RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE system_logs RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE employees RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE modulesettings RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE field_customization RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE audit_log RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE note RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE subscription RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE webhook RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE test_report RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE tenant_integration RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE announcement RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE file RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE user_invitation RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE ai_campaign RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE api_key RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE cash_flow RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE cron_job RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE performance_log RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE email_template RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE checkpoint RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE contact_history RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE lead_history RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE daily_sales_metrics RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE import_log RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE bizdev_source RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE archive_index RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE client_requirement RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE workflow RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE workflow_execution RENAME COLUMN tenant_uuid TO tenant_id;
ALTER TABLE users RENAME COLUMN tenant_uuid TO tenant_id;

-- ========================================
-- STEP 5: Add foreign key constraints
-- ========================================

ALTER TABLE accounts ADD CONSTRAINT fk_accounts_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE contacts ADD CONSTRAINT fk_contacts_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE leads ADD CONSTRAINT fk_leads_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE activities ADD CONSTRAINT fk_activities_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE opportunities ADD CONSTRAINT fk_opportunities_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE system_logs ADD CONSTRAINT fk_system_logs_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE employees ADD CONSTRAINT fk_employees_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE modulesettings ADD CONSTRAINT fk_modulesettings_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE field_customization ADD CONSTRAINT fk_field_customization_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE audit_log ADD CONSTRAINT fk_audit_log_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE note ADD CONSTRAINT fk_note_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE subscription ADD CONSTRAINT fk_subscription_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE webhook ADD CONSTRAINT fk_webhook_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE test_report ADD CONSTRAINT fk_test_report_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE tenant_integration ADD CONSTRAINT fk_tenant_integration_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE file ADD CONSTRAINT fk_file_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE user_invitation ADD CONSTRAINT fk_user_invitation_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE ai_campaign ADD CONSTRAINT fk_ai_campaign_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE api_key ADD CONSTRAINT fk_api_key_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE cash_flow ADD CONSTRAINT fk_cash_flow_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE performance_log ADD CONSTRAINT fk_performance_log_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE email_template ADD CONSTRAINT fk_email_template_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE checkpoint ADD CONSTRAINT fk_checkpoint_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE contact_history ADD CONSTRAINT fk_contact_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE lead_history ADD CONSTRAINT fk_lead_history_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE daily_sales_metrics ADD CONSTRAINT fk_daily_sales_metrics_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE import_log ADD CONSTRAINT fk_import_log_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE bizdev_source ADD CONSTRAINT fk_bizdev_source_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE archive_index ADD CONSTRAINT fk_archive_index_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE client_requirement ADD CONSTRAINT fk_client_requirement_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE workflow ADD CONSTRAINT fk_workflow_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE workflow_execution ADD CONSTRAINT fk_workflow_execution_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;

-- Nullable foreign key for tables that can have NULL tenant_id
ALTER TABLE announcement ADD CONSTRAINT fk_announcement_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE cron_job ADD CONSTRAINT fk_cron_job_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE;
ALTER TABLE users ADD CONSTRAINT fk_users_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE SET NULL;

-- ========================================
-- STEP 6: Set NOT NULL constraints (where appropriate)
-- ========================================

ALTER TABLE accounts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contacts ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE leads ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE activities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE opportunities ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE notifications ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE system_logs ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE employees ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE modulesettings ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE field_customization ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE audit_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE note ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE subscription ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE webhook ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE test_report ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE tenant_integration ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE file ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE user_invitation ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE ai_campaign ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE api_key ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE cash_flow ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE performance_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE email_template ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE checkpoint ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE contact_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE lead_history ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE daily_sales_metrics ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE import_log ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE bizdev_source ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE archive_index ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE client_requirement ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE workflow ALTER COLUMN tenant_id SET NOT NULL;
ALTER TABLE workflow_execution ALTER COLUMN tenant_id SET NOT NULL;

-- ========================================
-- STEP 7: Recreate indexes with new column type
-- ========================================

-- Drop old indexes if they exist (they were on TEXT columns)
DROP INDEX IF EXISTS idx_accounts_tenant;
DROP INDEX IF EXISTS idx_contacts_tenant;
DROP INDEX IF EXISTS idx_leads_tenant;
DROP INDEX IF EXISTS idx_activities_tenant;
DROP INDEX IF EXISTS idx_opportunities_tenant;
DROP INDEX IF EXISTS idx_notifications_tenant;
DROP INDEX IF EXISTS idx_system_logs_tenant;
DROP INDEX IF EXISTS idx_employees_tenant;
DROP INDEX IF EXISTS idx_modulesettings_tenant;
DROP INDEX IF EXISTS idx_field_customization_tenant;
DROP INDEX IF EXISTS idx_audit_log_tenant;
DROP INDEX IF EXISTS idx_note_tenant;
DROP INDEX IF EXISTS idx_webhook_tenant;
DROP INDEX IF EXISTS idx_test_report_tenant;
DROP INDEX IF EXISTS idx_tenant_integration_tenant;
DROP INDEX IF EXISTS idx_file_tenant;
DROP INDEX IF EXISTS idx_user_invitation_tenant;
DROP INDEX IF EXISTS idx_ai_campaign_tenant;
DROP INDEX IF EXISTS idx_api_key_tenant;
DROP INDEX IF EXISTS idx_cash_flow_tenant;
DROP INDEX IF EXISTS idx_performance_log_tenant;
DROP INDEX IF EXISTS idx_email_template_tenant;
DROP INDEX IF EXISTS idx_checkpoint_tenant;
DROP INDEX IF EXISTS idx_contact_history_tenant;
DROP INDEX IF EXISTS idx_lead_history_tenant;
DROP INDEX IF EXISTS idx_daily_sales_metrics_tenant;
DROP INDEX IF EXISTS idx_import_log_tenant;
DROP INDEX IF EXISTS idx_bizdev_source_tenant;
DROP INDEX IF EXISTS idx_archive_index_tenant;
DROP INDEX IF EXISTS idx_client_requirement_tenant;
DROP INDEX IF EXISTS idx_workflow_tenant;
DROP INDEX IF EXISTS idx_workflow_execution_tenant;

-- Create new indexes on UUID columns
CREATE INDEX idx_accounts_tenant ON accounts(tenant_id);
CREATE INDEX idx_contacts_tenant ON contacts(tenant_id);
CREATE INDEX idx_leads_tenant ON leads(tenant_id);
CREATE INDEX idx_activities_tenant ON activities(tenant_id);
CREATE INDEX idx_opportunities_tenant ON opportunities(tenant_id);
CREATE INDEX idx_notifications_tenant ON notifications(tenant_id);
CREATE INDEX idx_system_logs_tenant ON system_logs(tenant_id);
CREATE INDEX idx_employees_tenant ON employees(tenant_id);
CREATE INDEX idx_modulesettings_tenant ON modulesettings(tenant_id);
CREATE INDEX idx_field_customization_tenant ON field_customization(tenant_id);
CREATE INDEX idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX idx_note_tenant ON note(tenant_id);
CREATE INDEX idx_webhook_tenant ON webhook(tenant_id);
CREATE INDEX idx_test_report_tenant ON test_report(tenant_id);
CREATE INDEX idx_tenant_integration_tenant ON tenant_integration(tenant_id);
CREATE INDEX idx_file_tenant ON file(tenant_id);
CREATE INDEX idx_user_invitation_tenant ON user_invitation(tenant_id);
CREATE INDEX idx_ai_campaign_tenant ON ai_campaign(tenant_id);
CREATE INDEX idx_api_key_tenant ON api_key(tenant_id);
CREATE INDEX idx_cash_flow_tenant ON cash_flow(tenant_id);
CREATE INDEX idx_performance_log_tenant ON performance_log(tenant_id);
CREATE INDEX idx_email_template_tenant ON email_template(tenant_id);
CREATE INDEX idx_checkpoint_tenant ON checkpoint(tenant_id);
CREATE INDEX idx_contact_history_tenant ON contact_history(tenant_id);
CREATE INDEX idx_lead_history_tenant ON lead_history(tenant_id);
CREATE INDEX idx_daily_sales_metrics_tenant ON daily_sales_metrics(tenant_id);
CREATE INDEX idx_import_log_tenant ON import_log(tenant_id);
CREATE INDEX idx_bizdev_source_tenant ON bizdev_source(tenant_id);
CREATE INDEX idx_archive_index_tenant ON archive_index(tenant_id);
CREATE INDEX idx_client_requirement_tenant ON client_requirement(tenant_id);
CREATE INDEX idx_workflow_tenant ON workflow(tenant_id);
CREATE INDEX idx_workflow_execution_tenant ON workflow_execution(tenant_id);

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- All tenant_id columns are now UUID foreign keys pointing to tenant.id
-- This provides referential integrity and proper relational database design
