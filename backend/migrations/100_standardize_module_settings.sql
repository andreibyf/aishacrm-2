-- Migration 100: Standardize Module Settings
-- This migration:
-- 1. Adds missing modules (Workers, Construction Projects) to all tenants
-- 2. Adds feature metadata to all modules for consistency
-- 3. Removes test modules (if any)

-- Add Workers module to all tenants
INSERT INTO modulesettings (tenant_id, module_name, settings, is_enabled)
SELECT 
  t.id,
  'Workers',
  '{"features": ["worker_management", "contractor_management", "temp_labor", "skills_tracking", "certifications", "assignments"]}',
  true
FROM tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM modulesettings ms 
  WHERE ms.tenant_id = t.id 
  AND (ms.module_name = 'Workers' OR ms.module_name = 'workers')
);

-- Add Construction Projects module to all tenants
INSERT INTO modulesettings (tenant_id, module_name, settings, is_enabled)
SELECT 
  t.id,
  'Construction Projects',
  '{"features": ["project_management", "worker_assignments", "timeline_tracking", "budget_tracking", "materials_management", "progress_reports"]}',
  true
FROM tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM modulesettings ms 
  WHERE ms.tenant_id = t.id 
  AND ms.module_name = 'Construction Projects'
);

-- Add SalesReports module to all tenants if missing
INSERT INTO modulesettings (tenant_id, module_name, settings, is_enabled)
SELECT 
  t.id,
  'SalesReports',
  '{"features": ["sales_metrics", "revenue_reports", "pipeline_reports", "team_performance", "forecast_reports", "custom_dashboards"]}',
  true
FROM tenant t
WHERE NOT EXISTS (
  SELECT 1 FROM modulesettings ms 
  WHERE ms.tenant_id = t.id 
  AND ms.module_name = 'SalesReports'
);

-- Define feature sets for each module type
DO $$
BEGIN
  -- Workers (keep existing rich features)
  -- Already has: worker_management, contractor_management, temp_labor, skills_tracking, certifications, assignments
  
  -- Construction Projects
  UPDATE modulesettings 
  SET settings = '{"features": ["project_management", "worker_assignments", "timeline_tracking", "budget_tracking", "materials_management", "progress_reports"]}'
  WHERE module_name = 'Construction Projects' AND settings::text = '{}';

  -- Account Management
  UPDATE modulesettings 
  SET settings = '{"features": ["account_creation", "account_editing", "account_search", "account_relationships", "revenue_tracking", "account_hierarchy"]}'
  WHERE module_name = 'Account Management' AND settings::text = '{}';

  -- Contact Management
  UPDATE modulesettings 
  SET settings = '{"features": ["contact_creation", "contact_editing", "contact_search", "contact_relationships", "communication_history", "contact_import"]}'
  WHERE module_name = 'Contact Management' AND settings::text = '{}';

  -- Lead Management
  UPDATE modulesettings 
  SET settings = '{"features": ["lead_capture", "lead_qualification", "lead_scoring", "lead_conversion", "lead_assignment", "lead_nurturing"]}'
  WHERE module_name = 'Lead Management' AND settings::text = '{}';

  -- Opportunities
  UPDATE modulesettings 
  SET settings = '{"features": ["opportunity_creation", "pipeline_management", "stage_tracking", "probability_scoring", "revenue_forecasting", "win_loss_analysis"]}'
  WHERE module_name = 'Opportunities' AND settings::text = '{}';

  -- Activity Tracking
  UPDATE modulesettings 
  SET settings = '{"features": ["activity_logging", "task_management", "meeting_scheduling", "email_tracking", "call_logging", "activity_reports"]}'
  WHERE module_name = 'Activity Tracking' AND settings::text = '{}';

  -- Employee Management
  UPDATE modulesettings 
  SET settings = '{"features": ["employee_records", "role_management", "performance_tracking", "time_tracking", "employee_onboarding", "employee_offboarding"]}'
  WHERE module_name = 'Employee Management' AND settings::text = '{}';

  -- Calendar
  UPDATE modulesettings 
  SET settings = '{"features": ["event_scheduling", "meeting_management", "calendar_sync", "reminders", "availability_tracking", "team_calendars"]}'
  WHERE module_name = 'Calendar' AND settings::text = '{}';

  -- Dashboard
  UPDATE modulesettings 
  SET settings = '{"features": ["custom_widgets", "performance_metrics", "sales_analytics", "activity_summary", "revenue_charts", "team_performance"]}'
  WHERE module_name = 'Dashboard' AND settings::text = '{}';

  -- Analytics & Reports
  UPDATE modulesettings 
  SET settings = '{"features": ["custom_reports", "data_visualization", "export_functionality", "scheduled_reports", "report_sharing", "performance_analytics"]}'
  WHERE module_name = 'Analytics & Reports' AND settings::text = '{}';

  -- Cash Flow Management
  UPDATE modulesettings 
  SET settings = '{"features": ["invoice_tracking", "payment_tracking", "expense_management", "cash_flow_forecasting", "financial_reports", "budget_management"]}'
  WHERE module_name = 'Cash Flow Management' AND settings::text = '{}';

  -- Payment Portal
  UPDATE modulesettings 
  SET settings = '{"features": ["online_payments", "payment_methods", "invoice_generation", "payment_history", "recurring_billing", "payment_reminders"]}'
  WHERE module_name = 'Payment Portal' AND settings::text = '{}';

  -- Client Onboarding
  UPDATE modulesettings 
  SET settings = '{"features": ["onboarding_workflows", "document_collection", "welcome_emails", "setup_tasks", "training_resources", "onboarding_analytics"]}'
  WHERE module_name = 'Client Onboarding' AND settings::text = '{}';

  -- Document Processing & Management
  UPDATE modulesettings 
  SET settings = '{"features": ["document_upload", "document_storage", "version_control", "document_sharing", "document_search", "ocr_processing"]}'
  WHERE module_name = 'Document Processing & Management' AND settings::text = '{}';

  -- AI Agent
  UPDATE modulesettings 
  SET settings = '{"features": ["ai_chat", "automated_responses", "lead_qualification", "sentiment_analysis", "predictive_analytics", "recommendation_engine"]}'
  WHERE module_name = 'AI Agent' AND settings::text = '{}';

  -- AI Campaigns
  UPDATE modulesettings 
  SET settings = '{"features": ["campaign_creation", "audience_targeting", "email_campaigns", "campaign_analytics", "ab_testing", "automated_followups"]}'
  WHERE module_name = 'AI Campaigns' AND settings::text = '{}';

  -- Integrations
  UPDATE modulesettings 
  SET settings = '{"features": ["api_connections", "third_party_integrations", "data_sync", "webhook_management", "integration_monitoring", "custom_integrations"]}'
  WHERE module_name = 'Integrations' AND settings::text = '{}';

  -- Workflows
  UPDATE modulesettings 
  SET settings = '{"features": ["workflow_automation", "trigger_management", "action_sequences", "conditional_logic", "workflow_analytics", "template_library"]}'
  WHERE module_name = 'Workflows' AND settings::text = '{}';

  -- Utilities
  UPDATE modulesettings 
  SET settings = '{"features": ["data_import", "data_export", "bulk_operations", "system_settings", "user_preferences", "system_maintenance"]}'
  WHERE module_name = 'Utilities' AND settings::text = '{}';

  -- BizDev Sources
  UPDATE modulesettings 
  SET settings = '{"features": ["source_tracking", "lead_attribution", "source_analytics", "roi_calculation", "source_management", "conversion_tracking"]}'
  WHERE module_name = 'BizDev Sources' AND settings::text = '{}';

  -- SalesReports
  UPDATE modulesettings 
  SET settings = '{"features": ["sales_metrics", "revenue_reports", "pipeline_reports", "team_performance", "forecast_reports", "custom_dashboards"]}'
  WHERE module_name = 'SalesReports' AND settings::text = '{}';

  -- Realtime Voice
  UPDATE modulesettings 
  SET settings = '{"features": ["voice_calls", "call_recording", "transcription", "sentiment_analysis", "call_analytics", "voip_integration"]}'
  WHERE module_name = 'Realtime Voice' AND settings::text = '{}';

END $$;

-- Remove test modules (TestModule, TestModule123)
DELETE FROM modulesettings WHERE module_name LIKE 'TestModule%';

-- Verify results
SELECT 
  tenant_id,
  module_name,
  is_enabled,
  CASE 
    WHEN settings::text = '{}' THEN 0
    ELSE jsonb_array_length((settings::jsonb)->'features')
  END as feature_count
FROM modulesettings
WHERE module_name IN ('Workers', 'Construction Projects', 'SalesReports', 'Account Management')
ORDER BY module_name, tenant_id;
