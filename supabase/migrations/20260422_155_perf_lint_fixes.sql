-- Migration: 155_perf_lint_fixes
-- Applied to DEV (efzqxjpfewkrgpdootte) and PROD (ehjlenywplgyiahgxkfj) on 2026-04-22.
-- Addresses Supabase performance advisor findings:
--   * cash_flow.account_id FK changed from NO ACTION to SET NULL (unblocks account deletion)
--   * Drops duplicate index on field_customization
--   * Adds 48 indexes covering previously-unindexed foreign keys
-- Re-runnable: every CREATE INDEX uses IF NOT EXISTS.

BEGIN;

-- cash_flow.account_id FK → SET NULL
ALTER TABLE public.cash_flow DROP CONSTRAINT IF EXISTS cash_flow_account_id_fkey;
ALTER TABLE public.cash_flow
  ADD CONSTRAINT cash_flow_account_id_fkey
  FOREIGN KEY (account_id) REFERENCES public.accounts(id) ON DELETE SET NULL;

-- Drop duplicate index on field_customization
DROP INDEX IF EXISTS public.field_customization_tenant_id_uuid_idx;

-- 48 FK-coverage indexes
CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON public.accounts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON public.activities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_ai_settings_updated_by ON public.ai_settings(updated_by);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_suggestion ON public.ai_suggestion_feedback(suggestion_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestion_feedback_tenant     ON public.ai_suggestion_feedback(tenant_id);
CREATE INDEX IF NOT EXISTS idx_ai_suggestions_reviewed_by ON public.ai_suggestions(reviewed_by);
CREATE INDEX IF NOT EXISTS idx_announcement_tenant ON public.announcement(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_key_tenant ON public.api_key(tenant_id);
CREATE INDEX IF NOT EXISTS idx_apikey_tenant  ON public.apikey(tenant_id);
CREATE INDEX IF NOT EXISTS idx_archive_index_tenant ON public.archive_index(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON public.audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_activity ON public.booking_sessions(activity_id);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_contact  ON public.booking_sessions(contact_id);
CREATE INDEX IF NOT EXISTS idx_booking_sessions_lead     ON public.booking_sessions(lead_id);
CREATE INDEX IF NOT EXISTS idx_care_playbook_execution_playbook ON public.care_playbook_execution(playbook_id);
CREATE INDEX IF NOT EXISTS idx_comm_entity_links_message ON public.communications_entity_links(message_id);
CREATE INDEX IF NOT EXISTS idx_comm_entity_links_thread  ON public.communications_entity_links(thread_id);
CREATE INDEX IF NOT EXISTS idx_comm_lead_capture_message ON public.communications_lead_capture_queue(message_id);
CREATE INDEX IF NOT EXISTS idx_comm_lead_capture_thread  ON public.communications_lead_capture_queue(thread_id);
CREATE INDEX IF NOT EXISTS idx_comm_messages_thread ON public.communications_messages(thread_id);
CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON public.contacts(assigned_to);
CREATE INDEX IF NOT EXISTS idx_devai_health_alerts_resolved_by ON public.devai_health_alerts(resolved_by);
CREATE INDEX IF NOT EXISTS idx_documents_created_by ON public.documents(created_by);
CREATE INDEX IF NOT EXISTS idx_documents_updated_by ON public.documents(updated_by);
CREATE INDEX IF NOT EXISTS idx_leads_account ON public.leads(account_id);
CREATE INDEX IF NOT EXISTS idx_name_to_employee_employee ON public.name_to_employee(employee_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON public.opportunities(assigned_to);
CREATE INDEX IF NOT EXISTS idx_opportunities_lead        ON public.opportunities(lead_id);
CREATE INDEX IF NOT EXISTS idx_performance_logs_tenant ON public.performance_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_milestones_created_by ON public.project_milestones(created_by);
CREATE INDEX IF NOT EXISTS idx_project_assignments_created_by ON public.project_assignments(created_by);
CREATE INDEX IF NOT EXISTS idx_project_assignments_tenant     ON public.project_assignments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_project_assignments_worker     ON public.project_assignments(worker_id);
CREATE INDEX IF NOT EXISTS idx_projects_account                 ON public.projects(account_id);
CREATE INDEX IF NOT EXISTS idx_projects_created_by              ON public.projects(created_by);
CREATE INDEX IF NOT EXISTS idx_projects_lead                    ON public.projects(lead_id);
CREATE INDEX IF NOT EXISTS idx_projects_project_manager_contact ON public.projects(project_manager_contact_id);
CREATE INDEX IF NOT EXISTS idx_projects_supervisor_contact      ON public.projects(supervisor_contact_id);
CREATE INDEX IF NOT EXISTS idx_session_credits_contact ON public.session_credits(contact_id);
CREATE INDEX IF NOT EXISTS idx_session_credits_lead    ON public.session_credits(lead_id);
CREATE INDEX IF NOT EXISTS idx_subscription_plan   ON public.subscription(plan_id);
CREATE INDEX IF NOT EXISTS idx_subscription_tenant ON public.subscription(tenant_id);
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant ON public.system_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_billing_plan ON public.tenant_subscriptions(billing_plan_id);
CREATE INDEX IF NOT EXISTS idx_users_tenant ON public.users(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workers_created_by ON public.workers(created_by);
CREATE INDEX IF NOT EXISTS idx_workers_tenant     ON public.workers(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_workflow ON public.workflow_execution(workflow_id);

COMMIT;
