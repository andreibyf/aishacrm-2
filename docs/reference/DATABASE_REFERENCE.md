# AiSHA CRM – Database Reference

> **⚠️ LIVING DOCUMENT** — Always check this file first before running schema queries.
> Update this file whenever tables, columns, or RLS policies change.
> Last updated: 2026-04-02

---

## Environments

| Environment | Supabase Project ID    | Branch         | Tables | Postgres |
| ----------- | ---------------------- | -------------- | ------ | -------- |
| **Prod**    | `ehjlenywplgyiahgxkfj` | `main`         | 88     | 17.6.1   |
| **Dev**     | `efzqxjpfewkrgpdootte` | `aishacrm-dev` | 89     | 17.x     |

**Dev-only tables:** `name_to_employee_backup` (leftover from employee cache feature — safe to drop)

---

## Schema Gotchas

- `contacts` has **NO `company` column** — derive from `accounts` via `account_id` join
- Always use `tenant_id` (UUID) for isolation — never `tenant_id_text` (slug, deprecated)
- Timestamps: some tables use `created_at`/`updated_at`, others use `created_date`/`updated_date` — check per table
- `cash_flow`: prod has `transaction_type` + `type`; dev has them swapped in order
- `name_to_employee`: column sets differ between prod and dev (see table below)

---

## Tables — Columns

Format: `table_name` → columns (alphabetical within groups)

### Core CRM Entities

#### `accounts`

`id`, `name`, `industry`, `website`, `type`, `account_type`, `description`, `email`, `phone`, `employee_count`, `annual_revenue`, `street`, `city`, `state`, `zip`, `country`, `status` _(no status col — use health_status)_, `health_status`, `score`, `score_reason`, `assigned_to`, `assigned_to_team`, `tags`, `notes`, `is_placeholder`, `is_test_data`, `normalized_name`, `unique_id`, `legacy_id`, `ai_action`, `last_activity_date`, `next_action`, `activity_metadata`, `processed_by_ai_doc`, `ai_doc_source_type`, `last_synced`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

> ⚠️ **Prod/Dev diff:** prod has `annual_revenue` before `assigned_to`; dev has `description` at end

#### `contacts`

`id`, `first_name`, `last_name`, `email`, `phone`, `mobile`, `account_id`, `account_name`, `account_industry`, `job_title`, `title`, `department`, `status`, `lead_source`, `worker_role`, `source_id`, `address_1`, `address_2`, `city`, `state`, `zip`, `country`, `score`, `score_reason`, `assigned_to`, `assigned_to_name`, `assigned_to_team`, `tags`, `notes`, `ai_action`, `last_contacted`, `next_action`, `activity_metadata`, `unique_id`, `legacy_id`, `processed_by_ai_doc`, `ai_doc_source_type`, `last_synced`, `tags_jsonb_old` _(deprecated)_, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

> ⚠️ **No `company` column** — use `accounts!contacts_account_id_fkey(name)`

#### `leads`

`id`, `first_name`, `last_name`, `email`, `phone`, `company`, `job_title`, `title`, `description`, `status`, `qualification_status`, `lead_type`, `source`, `source_id`, `account_id`, `person_id`, `score`, `score_reason`, `conversion_probability`, `estimated_value`, `assigned_to`, `assigned_to_team`, `tags`, `address_1`, `address_2`, `city`, `state`, `zip`, `country`, `do_not_call`, `do_not_text`, `ai_action`, `last_contacted`, `next_action`, `activity_metadata`, `unique_id`, `legacy_id`, `processed_by_ai_doc`, `ai_doc_source_type`, `last_synced`, `tags_jsonb_old` _(deprecated)_, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

#### `opportunities`

`id`, `name`, `stage`, `amount`, `probability`, `expected_revenue`, `win_probability`, `close_date`, `account_id`, `contact_id`, `lead_id`, `type`, `source`, `lead_source`, `description`, `next_step`, `competitor`, `competitors`, `notes`, `score`, `score_reason`, `ai_health`, `risk_factors`, `ai_action`, `last_activity_date`, `next_action`, `days_in_stage`, `activity_metadata`, `assigned_to`, `assigned_to_team`, `tags`, `unique_id`, `legacy_id`, `processed_by_ai_doc`, `ai_doc_source_type`, `last_synced`, `tags_jsonb_old` _(deprecated)_, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

#### `activities`

`id`, `type`, `subject`, `body`, `description`, `status`, `priority`, `ai_priority`, `urgency_score`, `outcome`, `sentiment`, `ai_summary`, `ai_action`, `key_points`, `related_id`, `related_to`, `related_email`, `related_name`, `due_date`, `due_time`, `duration_minutes`, `location`, `competitor`, `lead_source`, `assigned_to`, `assigned_to_team`, `assigned_to_employee_id`, `created_by`, `tags`, `ai_call_config`, `ai_email_config`, `activity_metadata`, `unique_id`, `legacy_id`, `processed_by_ai_doc`, `ai_doc_source_type`, `last_synced`, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`, `updated_date`

#### `bizdev_sources`

`id`, `source`, `source_type`, `source_url`, `company_name`, `dba_name`, `industry`, `website`, `email`, `phone_number`, `address_line_1`, `address_line_2`, `city`, `state_province`, `postal_code`, `country`, `contact_person`, `contact_email`, `contact_phone`, `status`, `priority`, `industry_license`, `license_status`, `license_expiry_date`, `leads_generated`, `lead_ids`, `opportunities_created`, `revenue_generated`, `account_id`, `account_name`, `assigned_to`, `assigned_to_team`, `batch_id`, `notes`, `tags`, `archived_at`, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

#### `note`

`id`, `title`, `content`, `type`, `related_type`, `related_id`, `created_by`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

---

### AI & Automation

#### `ai_suggestions`

`id`, `record_type`, `record_id`, `record_name`, `action`, `status`, `priority`, `confidence`, `reasoning`, `outcome_type`, `outcome_tracked`, `outcome_positive`, `outcome_measured_at`, `trigger_id`, `trigger_context`, `apply_result`, `applied_at`, `reviewed_at`, `reviewed_by`, `feedback_rating`, `feedback_comment`, `expires_at`, `execution_time_ms`, `model_version`, `tenant_id`, `created_at`, `created_date`, `updated_at`

#### `ai_settings`

`id`, `tenant_id`, `agent_role`, `category`, `setting_key`, `setting_value`, `display_name`, `description`, `updated_by`, `created_at`, `updated_at`

#### `ai_conversation_summaries`

`id`, `tenant_id`, `conversation_key`, `summary`, `metadata`, `created_at`, `updated_at`

#### `ai_memory_chunks`

`id`, `tenant_id`, `entity_type`, `entity_id`, `source_type`, `content`, `content_hash`, `embedding`, `metadata`, `created_at`, `updated_at`

#### `ai_campaign`

`id`, `name`, `type`, `campaign_type`, `status`, `description`, `target_audience`, `target_contacts`, `content`, `scheduled_at`, `sent_at`, `assigned_to`, `performance_metrics`, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

#### `braid_audit_log`

`id`, `tenant_id`, `user_id`, `user_email`, `user_role`, `tool_name`, `braid_function`, `braid_file`, `policy`, `tool_class`, `input_args`, `result_tag`, `result_value`, `error_type`, `error_message`, `execution_time_ms`, `cache_hit`, `rate_limit_remaining`, `rate_limit_window`, `ip_address`, `user_agent`, `request_id`, `is_dry_run`, `requires_confirmation`, `confirmation_provided`, `entity_type`, `entity_id`, `created_at`

#### `conversations` / `conversation_messages`

`conversations`: `id`, `tenant_id`, `agent_name`, `title`, `topic`, `status`, `metadata`, `created_date`, `updated_date`
`conversation_messages`: `id`, `conversation_id`, `role`, `content`, `metadata`, `created_date`

#### `workflows` / `workflow_execution` / `workflow_template`

`workflow`: `id`, `name`, `description`, `trigger_type`, `trigger_config`, `actions`, `is_active`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`
`workflow_execution`: `id`, `workflow_id`, `status`, `trigger_data`, `execution_log`, `started_at`, `completed_at`, `metadata`, `tenant_id`, `created_at`, `created_date`
`workflow_template`: `id`, `name`, `description`, `category`, `trigger_type`, `trigger_config`, `template_nodes`, `template_connections`, `parameters`, `use_cases`, `is_active`, `is_system`, `tenant_id`, `created_at`, `created_date`, `updated_at`

---

### C.A.R.E. (Customer Automated Response Engine)

#### `care_playbook`

`id`, `tenant_id`, `name`, `description`, `trigger_type`, `trigger_config`, `steps`, `execution_mode`, `is_enabled`, `shadow_mode`, `priority`, `cooldown_minutes`, `max_executions_per_day`, `webhook_url`, `webhook_secret`, `created_by`, `created_at`, `updated_at`

#### `care_playbook_execution`

`id`, `tenant_id`, `playbook_id`, `trigger_type`, `entity_type`, `entity_id`, `status`, `current_step`, `total_steps`, `step_results`, `next_step_at`, `stopped_reason`, `tokens_used`, `shadow_mode`, `started_at`, `completed_at`

#### `care_workflow_config`

`id`, `tenant_id`, `workflow_id`, `name`, `description`, `webhook_url`, `webhook_secret`, `is_enabled`, `state_write_enabled`, `shadow_mode`, `webhook_timeout_ms`, `webhook_max_retries`, `created_at`, `updated_at`

#### `customer_care_state` / `customer_care_state_history`

`customer_care_state`: `id`, `tenant_id`, `entity_type`, `entity_id`, `care_state`, `hands_off_enabled`, `escalation_status`, `last_signal_at`, `created_at`, `updated_at`
`customer_care_state_history`: `id`, `tenant_id`, `entity_type`, `entity_id`, `from_state`, `to_state`, `event_type`, `reason`, `meta`, `actor_type`, `actor_id`, `created_at`

---

### People & Teams

#### `employees`

`id`, `first_name`, `last_name`, `email`, `role`, `department`, `phone`, `whatsapp_number`, `whatsapp_enabled`, `reports_to`, `status`, `is_test_data`, `metadata`, `tenant_id`, `created_at`, `created_date`, `updated_at`

#### `users`

`id`, `email`, `password_hash`, `first_name`, `last_name`, `role`, `employee_role`, `status`, `perm_notes_anywhere`, `perm_all_records`, `perm_reports`, `perm_employees`, `perm_settings`, `nav_permissions`, `metadata`, `tenant_id`, `created_at`, `updated_at`

#### `teams` / `team_members`

`teams`: `id`, `tenant_id`, `name`, `description`, `parent_team_id`, `is_active`, `created_at`, `updated_at`
`team_members`: `id`, `team_id`, `employee_id`, `user_id`, `role`, `access_level`, `created_at`

#### `name_to_employee`

> ⚠️ **Schema differs between prod and dev:**

- **Prod:** `id`, `name_variation`, `employee_id`, `employee_name`, `tenant_id`, `created_at`, `created_date`, `updated_at`
- **Dev:** `id`, `tenant_id`, `name_variation`, `employee_id`, `metadata`, `created_at`, `created_date`

#### `workers` (field workforce)

`id`, `tenant_id`, `first_name`, `last_name`, `email`, `phone`, `worker_type`, `status`, `primary_skill`, `skills`, `certifications`, `default_pay_rate`, `default_rate_type`, `available_from`, `available_until`, `emergency_contact_name`, `emergency_contact_phone`, `notes`, `metadata`, `created_by`, `created_at`, `created_date`, `updated_at`

---

### Projects & Construction

#### `projects`

`id`, `tenant_id`, `project_name`, `account_id`, `lead_id`, `site_name`, `site_address`, `project_manager_contact_id`, `supervisor_contact_id`, `start_date`, `end_date`, `project_value`, `status`, `description`, `notes`, `metadata`, `created_by`, `created_at`, `created_date`, `updated_at`

#### `project_milestones`

`id`, `tenant_id`, `project_id`, `title`, `description`, `due_date`, `completed_at`, `status`, `sort_order`, `metadata`, `created_by`, `created_at`, `updated_at`

#### `project_assignments`

`id`, `tenant_id`, `project_id`, `worker_id`, `role`, `start_date`, `end_date`, `pay_rate`, `bill_rate`, `rate_type`, `status`, `notes`, `metadata`, `created_by`, `created_at`, `created_date`, `updated_at`

#### `client_requirement`

`id`, `tenant_id`, `title`, `description`, `status`, `priority`, `due_date`, `assigned_to`, `assigned_to_employee_id`, `metadata`, `created_at`, `created_date`, `updated_at`

---

### Communications

#### `communications_threads`

`id`, `tenant_id`, `mailbox_id`, `mailbox_address`, `subject`, `normalized_subject`, `participants`, `origin`, `status`, `first_message_at`, `last_message_at`, `metadata`, `created_at`, `updated_at`

#### `communications_messages`

`id`, `tenant_id`, `thread_id`, `internet_message_id`, `direction`, `provider_cursor`, `subject`, `sender_email`, `sender_name`, `recipients`, `cc`, `bcc`, `received_at`, `text_body`, `html_body`, `raw_source`, `headers`, `activity_id`, `metadata`, `created_at`, `updated_at`

#### `communications_entity_links`

`id`, `tenant_id`, `thread_id`, `message_id`, `entity_type`, `entity_id`, `link_scope`, `source`, `confidence`, `metadata`, `created_at`

#### `communications_lead_capture_queue`

`id`, `tenant_id`, `thread_id`, `message_id`, `mailbox_id`, `mailbox_address`, `sender_email`, `sender_name`, `sender_domain`, `subject`, `normalized_subject`, `status`, `reason`, `metadata`, `created_at`, `updated_at`

---

### Finance

#### `cash_flow`

`id`, `tenant_id`, `transaction_date`, `amount`, `transaction_type`, `type`, `category`, `description`, `account_id`, `metadata`, `created_at`, `created_date`

#### `daily_sales_metrics`

`id`, `tenant_id`, `metric_date`, `total_revenue`, `new_deals`, `closed_deals`, `pipeline_value`, `metadata`, `created_at`, `created_date`

#### `subscription` / `subscription_plan`

`subscription`: `id`, `tenant_id`, `plan_id`, `status`, `start_date`, `end_date`, `stripe_subscription_id`, `metadata`, `created_at`, `created_date`, `updated_at`
`subscription_plan`: `id`, `name`, `price`, `billing_cycle`, `features`, `is_active`, `metadata`, `created_at`, `updated_at`

#### `session_credits` / `session_packages`

`session_credits`: `id`, `tenant_id`, `contact_id`, `lead_id`, `package_id`, `credits_purchased`, `credits_remaining`, `purchase_date`, `expiry_date`, `metadata`, `created_at`, `updated_at`
`session_packages`: `id`, `tenant_id`, `name`, `description`, `session_count`, `price_cents`, `validity_days`, `is_active`, `created_at`, `updated_at`

---

### Tenant & System

#### `tenant`

`id`, `tenant_id`, `name`, `status`, `domain`, `country`, `industry`, `major_city`, `business_model`, `geographic_focus`, `subscription_tier`, `display_order`, `elevenlabs_agent_id`, `branding_settings`, `metadata`, `created_at`, `updated_at`

#### `users` — permissions columns

`perm_notes_anywhere`, `perm_all_records`, `perm_reports`, `perm_employees`, `perm_settings`, `nav_permissions`, `employee_role`

#### `entity_labels`

`id`, `tenant_id`, `entity_key`, `custom_label`, `custom_label_singular`, `created_at`, `created_date`, `updated_at`

#### `field_customization`

`id`, `tenant_id`, `entity_type`, `field_name`, `label`, `is_visible`, `is_required`, `options`, `metadata`, `created_at`, `created_date`, `updated_at`

#### `modulesettings`

`id`, `tenant_id`, `module_name`, `settings`, `is_enabled`, `created_at`, `created_date`, `updated_at`

#### `system_settings`

`id`, `settings`, `updated_at` _(no tenant_id — global)_

#### `systembranding`

`id`, `tenant_id`, `name`, `payload`, `created_at`, `created_date`

#### `tenant_integration` / `tenant_integrations`

> ⚠️ Two separate tables exist — `tenant_integration` (simpler) and `tenant_integrations` (full). Both in prod; only `tenant_integrations` has RLS policy in dev.
> `tenant_integration`: `id`, `tenant_id`, `integration_type`, `config`, `is_active`, `last_sync`, `metadata`, `created_at`, `created_date`, `updated_at`
> `tenant_integrations`: `id`, `tenant_id`, `integration_type`, `integration_name`, `is_active`, `api_credentials`, `config`, `sync_status`, `error_message`, `last_sync`, `metadata`, `created_at`, `created_date`, `updated_at`

---

### Logging & Audit

#### `audit_log`

`id`, `tenant_id`, `user_email`, `action`, `entity_type`, `entity_id`, `changes`, `ip_address`, `user_agent`, `request_id`, `created_at`, `created_date`

#### `performance_logs`

`id`, `tenant_id`, `method`, `endpoint`, `status_code`, `duration_ms`, `response_time_ms`, `db_query_time_ms`, `user_email`, `ip_address`, `user_agent`, `error_message`, `error_stack`, `created_at`, `created_date`

#### `system_logs`

`id`, `tenant_id`, `level`, `message`, `source`, `url`, `user_email`, `user_agent`, `stack_trace`, `metadata`, `created_at`, `created_date`

#### `devai_approvals` / `devai_audit` / `devai_health_alerts`

`devai_approvals`: `id`, `requested_by`, `status`, `tool_name`, `tool_args`, `preview`, `approved_by`, `approved_at`, `executed_at`, `error`, `changed_files`, `diff`, `before_snapshot`, `after_snapshot`, `note`, `rejected_reason`, `created_at`, `updated_at`
`devai_audit`: `id`, `actor`, `action`, `approval_id`, `details`, `created_at`
`devai_health_alerts`: `id`, `tenant_id`, `severity`, `category`, `title`, `summary`, `details`, `affected_endpoints`, `error_count`, `recommendation`, `auto_detected`, `false_positive`, `detected_at`, `resolved_at`, `resolved_by`, `created_at`, `updated_at`

---

### Archives & Misc

`agent_events_archive`, `agent_sessions_archive` — service_role only
`archive_index` — `id`, `tenant_id`, `entity_type`, `entity_id`, `archived_data`, `archived_by`, `archived_at`, `metadata`, `created_at`, `created_date`
`artifact_refs` — `id`, `tenant_id`, `kind`, `entity_type`, `entity_id`, `r2_key`, `content_type`, `size_bytes`, `sha256`, `created_by`, `created_at`
`assignment_history` — `id`, `tenant_id`, `entity_type`, `entity_id`, `assigned_from`, `assigned_to`, `assigned_by`, `action`, `note`, `created_at`
`entity_transitions` — `id`, `tenant_id`, `from_table`, `from_id`, `to_table`, `to_id`, `action`, `performed_by`, `performed_at`, `snapshot`
`person_profile` — materialized/denormalized view table for AI snapshot queries
`pep_saved_reports` — `id`, `tenant_id`, `report_name`, `filename`, `plain_english`, `compiled_ir`, `run_count`, `last_run_at`, `created_by`, `created_at`, `updated_at`
`checkpoint` — `id`, `tenant_id`, `entity_type`, `entity_id`, `checkpoint_data`, `version`, `created_by`, `metadata`, `created_at`, `created_date`
`booking_sessions` — `id`, `tenant_id`, `credit_id`, `calcom_booking_id`, `calcom_event_type_id`, `contact_id`, `lead_id`, `scheduled_start`, `scheduled_end`, `status`, `activity_id`, `cancellation_reason`, `created_at`, `updated_at`

---

## RLS Policy Summary

### Policy patterns in use

| Pattern                                      | Tables                                                     | Role            | Commands      |
| -------------------------------------------- | ---------------------------------------------------------- | --------------- | ------------- |
| `{table}_tenant_select/insert/update/delete` | accounts, contacts, leads, opportunities, activities, etc. | `authenticated` | Per-operation |
| `Service role full access to {table}`        | Most system/config tables                                  | `service_role`  | ALL           |
| `{table}_tenant_isolation`                   | Many AI/comms tables                                       | `authenticated` | ALL           |
| `service_role_{table}_all`                   | AI suggestion metrics, agent archives                      | `service_role`  | ALL           |
| `tenant_isolation_{table}_{cmd}`             | Legacy pattern (note, workflow, notifications)             | `public`        | Per-operation |

### Tables with `public` role policies (⚠️ review)

These use the `public` role rather than `authenticated` — potentially overly permissive:
`note`, `workflow`, `workflow_execution`, `notifications`, `synchealth`, `client_requirement`, `booking_sessions`, `session_credits`, `session_packages`, `person_profile`, `project_assignments`, `workers`, `name_to_employee`

### Policy diffs between prod and dev

| Table                     | Prod                                                                       | Dev                                                |
| ------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------- |
| `devai_approvals`         | Has `insert_own`, `own_requests`, `update_approver` policies               | ❌ No policies                                     |
| `devai_audit`             | Has `insert`, `read` policies                                              | ❌ No policies                                     |
| `leads`                   | No service_role policy                                                     | Has `Service role full access to leads`            |
| `system_settings`         | `service_role_modify` + `service_role_select` (authenticated ALL + SELECT) | `system_settings_read` (authenticated SELECT only) |
| `systembranding`          | `Service role full access` (service_role ALL)                              | `systembranding_read` (authenticated SELECT only)  |
| `tenant_integration`      | Has `Service role full access` policy                                      | ❌ No RLS policy                                   |
| `name_to_employee_backup` | ❌ Doesn't exist                                                           | Exists (safe to drop)                              |

> ⚠️ The missing `devai_approvals`/`devai_audit` policies in dev and missing `tenant_integration` policy in dev may be contributing to the `MIGRATIONS_FAILED` status on both branches.

---

## How to Update This Document

When making schema changes (migrations, new tables, column adds/drops):

1. Run the relevant queries in Supabase MCP to get current state
2. Update the affected table's column list above
3. Update the RLS Policy Summary if policies changed
4. Update the table count in the header
5. Note any prod/dev diffs in the diff table

```sql
-- Re-query columns for a specific table
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'your_table'
ORDER BY ordinal_position;

-- Re-query policies for a specific table
SELECT policyname, roles, cmd, has_using, has_check
FROM pg_policies WHERE schemaname = 'public' AND tablename = 'your_table';
```
