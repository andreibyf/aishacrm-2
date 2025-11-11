-- Complete Schema Migration
-- Adds all remaining tables needed for full CRM functionality

-- Tenant table
CREATE TABLE IF NOT EXISTS tenant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'active',
  branding_settings JSONB DEFAULT '{}',
  subscription_tier TEXT DEFAULT 'free',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Field Customization
CREATE TABLE IF NOT EXISTS field_customization (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  field_name TEXT NOT NULL,
  label TEXT,
  is_visible BOOLEAN DEFAULT true,
  is_required BOOLEAN DEFAULT false,
  options JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, entity_type, field_name)
);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  changes JSONB DEFAULT '{}',
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Notes
CREATE TABLE IF NOT EXISTS note (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  title TEXT,
  content TEXT,
  related_type TEXT,
  related_id UUID,
  created_by TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscription Plans
CREATE TABLE IF NOT EXISTS subscription_plan (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  price DECIMAL(15,2) NOT NULL,
  billing_cycle TEXT DEFAULT 'monthly',
  features JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Subscriptions
CREATE TABLE IF NOT EXISTS subscription (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  plan_id UUID REFERENCES subscription_plan(id),
  status TEXT DEFAULT 'active',
  start_date DATE,
  end_date DATE,
  stripe_subscription_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Webhooks
CREATE TABLE IF NOT EXISTS webhook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  url TEXT NOT NULL,
  event_types JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  secret TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Test Reports
CREATE TABLE IF NOT EXISTS test_report (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  test_suite TEXT NOT NULL,
  status TEXT DEFAULT 'pending',
  results JSONB DEFAULT '{}',
  duration INTEGER,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tenant Integrations
CREATE TABLE IF NOT EXISTS tenant_integration (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  integration_type TEXT NOT NULL,
  config JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  last_sync TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, integration_type)
);

-- Announcements
CREATE TABLE IF NOT EXISTS announcement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  is_active BOOLEAN DEFAULT true,
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  target_roles JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Documentation
CREATE TABLE IF NOT EXISTS documentation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  tags JSONB DEFAULT '[]',
  is_published BOOLEAN DEFAULT false,
  author TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Files
CREATE TABLE IF NOT EXISTS file (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  filesize BIGINT,
  mimetype TEXT,
  related_type TEXT,
  related_id UUID,
  uploaded_by TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- User Invitations
CREATE TABLE IF NOT EXISTS user_invitation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  token TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending',
  invited_by TEXT,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Guide Content
CREATE TABLE IF NOT EXISTS guide_content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  category TEXT,
  order_index INTEGER DEFAULT 0,
  is_published BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- AI Campaigns
CREATE TABLE IF NOT EXISTS ai_campaign (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'email',
  status TEXT DEFAULT 'draft',
  target_audience JSONB DEFAULT '{}',
  content JSONB DEFAULT '{}',
  scheduled_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- API Keys
CREATE TABLE IF NOT EXISTS api_key (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  scopes JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  last_used TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cash Flow
CREATE TABLE IF NOT EXISTS cash_flow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  amount DECIMAL(15,2) NOT NULL,
  type TEXT NOT NULL,
  category TEXT,
  description TEXT,
  account_id UUID REFERENCES accounts(id),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Cron Jobs
CREATE TABLE IF NOT EXISTS cron_job (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT,
  name TEXT NOT NULL,
  schedule TEXT NOT NULL,
  function_name TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  last_run TIMESTAMPTZ,
  next_run TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Performance Logs
CREATE TABLE IF NOT EXISTS performance_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  operation TEXT NOT NULL,
  duration INTEGER NOT NULL,
  status TEXT DEFAULT 'success',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Email Templates
CREATE TABLE IF NOT EXISTS email_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'marketing',
  variables JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Checkpoints
CREATE TABLE IF NOT EXISTS checkpoint (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  checkpoint_data JSONB NOT NULL,
  version INTEGER DEFAULT 1,
  created_by TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Contact History
CREATE TABLE IF NOT EXISTS contact_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Lead History
CREATE TABLE IF NOT EXISTS lead_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES leads(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  changed_by TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Daily Sales Metrics
CREATE TABLE IF NOT EXISTS daily_sales_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  metric_date DATE NOT NULL,
  total_revenue DECIMAL(15,2) DEFAULT 0,
  new_deals INTEGER DEFAULT 0,
  closed_deals INTEGER DEFAULT 0,
  pipeline_value DECIMAL(15,2) DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(tenant_id, metric_date)
);

-- Cache
CREATE TABLE IF NOT EXISTS cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key TEXT UNIQUE NOT NULL,
  cache_value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Import Logs
CREATE TABLE IF NOT EXISTS import_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  filename TEXT,
  status TEXT DEFAULT 'processing',
  total_records INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- BizDev Sources
CREATE TABLE IF NOT EXISTS bizdev_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'website',
  url TEXT,
  status TEXT DEFAULT 'active',
  last_scraped TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Archive Index
CREATE TABLE IF NOT EXISTS archive_index (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  archived_data JSONB NOT NULL,
  archived_by TEXT,
  archived_at TIMESTAMPTZ DEFAULT now(),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Client Requirements
CREATE TABLE IF NOT EXISTS client_requirement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT DEFAULT 'pending',
  priority TEXT DEFAULT 'medium',
  due_date DATE,
  assigned_to TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workflows
CREATE TABLE IF NOT EXISTS workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  trigger_type TEXT NOT NULL,
  trigger_config JSONB DEFAULT '{}',
  actions JSONB DEFAULT '[]',
  is_active BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Workflow Executions
CREATE TABLE IF NOT EXISTS workflow_execution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID REFERENCES workflow(id) ON DELETE CASCADE,
  tenant_id TEXT NOT NULL,
  status TEXT DEFAULT 'running',
  trigger_data JSONB DEFAULT '{}',
  execution_log JSONB DEFAULT '[]',
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_tenant_tenant_id ON tenant(tenant_id);
CREATE INDEX IF NOT EXISTS idx_field_customization_tenant ON field_customization(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant ON audit_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(tenant_id, user_email);
CREATE INDEX IF NOT EXISTS idx_note_tenant ON note(tenant_id);
CREATE INDEX IF NOT EXISTS idx_note_related ON note(tenant_id, related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_webhook_tenant ON webhook(tenant_id);
CREATE INDEX IF NOT EXISTS idx_test_report_tenant ON test_report(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_integration_tenant ON tenant_integration(tenant_id);
CREATE INDEX IF NOT EXISTS idx_announcement_active ON announcement(is_active, start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_file_tenant ON file(tenant_id);
CREATE INDEX IF NOT EXISTS idx_file_related ON file(tenant_id, related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_user_invitation_tenant ON user_invitation(tenant_id);
CREATE INDEX IF NOT EXISTS idx_user_invitation_token ON user_invitation(token);
CREATE INDEX IF NOT EXISTS idx_ai_campaign_tenant ON ai_campaign(tenant_id);
CREATE INDEX IF NOT EXISTS idx_api_key_tenant ON api_key(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_tenant ON cash_flow(tenant_id);
CREATE INDEX IF NOT EXISTS idx_cash_flow_date ON cash_flow(tenant_id, transaction_date);
CREATE INDEX IF NOT EXISTS idx_cron_job_active ON cron_job(is_active, next_run);
CREATE INDEX IF NOT EXISTS idx_performance_log_tenant ON performance_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_template_tenant ON email_template(tenant_id);
CREATE INDEX IF NOT EXISTS idx_checkpoint_tenant ON checkpoint(tenant_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_contact_history_contact ON contact_history(contact_id);
CREATE INDEX IF NOT EXISTS idx_lead_history_lead ON lead_history(lead_id);
CREATE INDEX IF NOT EXISTS idx_daily_sales_metrics_tenant ON daily_sales_metrics(tenant_id, metric_date);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache(expires_at);
CREATE INDEX IF NOT EXISTS idx_import_log_tenant ON import_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_bizdev_source_tenant ON bizdev_source(tenant_id);
CREATE INDEX IF NOT EXISTS idx_archive_index_tenant ON archive_index(tenant_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_client_requirement_tenant ON client_requirement(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_tenant ON workflow(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_workflow ON workflow_execution(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_execution_tenant ON workflow_execution(tenant_id);
