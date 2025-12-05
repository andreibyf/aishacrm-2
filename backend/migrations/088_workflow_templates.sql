-- Migration 088: Workflow Templates
-- Adds workflow_template table for AI-accessible workflow patterns

-- Create workflow_template table
CREATE TABLE IF NOT EXISTS workflow_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general',
  
  -- Tenant ownership (NULL for system templates, UUID for tenant-specific)
  -- No FK constraint to avoid dependency issues - validated at application level
  tenant_id UUID,
  
  -- Template structure (nodes, connections with {{placeholders}})
  template_nodes JSONB NOT NULL DEFAULT '[]',
  template_connections JSONB NOT NULL DEFAULT '[]',
  trigger_type VARCHAR(50) DEFAULT 'webhook',
  trigger_config JSONB DEFAULT '{}',
  
  -- Configurable parameters that AI can fill in
  -- Each param: { name, type, description, required, default, options? }
  parameters JSONB NOT NULL DEFAULT '[]',
  
  -- Example use cases for AI context
  use_cases TEXT[] DEFAULT '{}',
  
  -- Metadata
  is_active BOOLEAN DEFAULT true,
  is_system BOOLEAN DEFAULT false,  -- System templates cannot be deleted
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for lookups and RLS performance
CREATE INDEX IF NOT EXISTS idx_workflow_template_category ON workflow_template(category);
CREATE INDEX IF NOT EXISTS idx_workflow_template_active ON workflow_template(is_active);
CREATE INDEX IF NOT EXISTS idx_workflow_template_tenant ON workflow_template(tenant_id);
CREATE INDEX IF NOT EXISTS idx_workflow_template_system ON workflow_template(is_system);

-- Enable Row Level Security
ALTER TABLE workflow_template ENABLE ROW LEVEL SECURITY;

-- RLS Policies for workflow_template
-- System templates (is_system=true, tenant_id IS NULL) are readable by all
-- Tenant templates are only visible/editable by their tenant using current_setting

-- SELECT: Can read system templates OR own tenant templates
DROP POLICY IF EXISTS workflow_template_tenant_isolation ON workflow_template;
CREATE POLICY workflow_template_tenant_isolation ON workflow_template
  FOR ALL
  USING (
    is_system = true 
    OR tenant_id IS NULL 
    OR tenant_id = current_setting('app.current_tenant_id', true)::uuid
  );

-- Insert default templates

-- Template 1: New Lead Welcome Email
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'New Lead Welcome Email',
  'Sends a welcome email when a new lead is created via webhook. Configurable email subject and body.',
  'lead_nurturing',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "email-1", "type": "send_email", "config": {"to": "{{email}}", "subject": "{{email_subject}}", "body": "{{email_body}}"}, "position": {"x": 400, "y": 300}}
  ]'::jsonb,
  '[{"from": "trigger-1", "to": "email-1"}]'::jsonb,
  'webhook',
  '[
    {"name": "email_subject", "type": "string", "description": "Email subject line", "required": true, "default": "Welcome to our platform!"},
    {"name": "email_body", "type": "text", "description": "Email body content (supports {{first_name}}, {{company}} variables)", "required": true, "default": "Hi {{first_name}},\n\nThank you for your interest! We will be in touch soon.\n\nBest regards"}
  ]'::jsonb,
  ARRAY['Send welcome email to new leads', 'Automate lead acknowledgment', 'First touchpoint automation'],
  true
) ON CONFLICT DO NOTHING;

-- Template 2: Lead Qualification + Follow-up
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'Lead Qualification with Follow-up',
  'Finds a lead by email, checks company size, and creates a follow-up activity if qualified.',
  'lead_qualification',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "find-lead-1", "type": "find_lead", "config": {"search_field": "email", "search_value": "{{email}}"}, "position": {"x": 400, "y": 250}},
    {"id": "condition-1", "type": "condition", "config": {"field": "company", "operator": "exists", "value": ""}, "position": {"x": 400, "y": 400}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "{{activity_type}}", "subject": "{{activity_subject}}", "related_type": "lead", "related_field": "found_lead.id"}, "position": {"x": 250, "y": 550}},
    {"id": "update-1", "type": "update_lead", "config": {"field_mappings": [{"lead_field": "status", "webhook_field": "qualified"}]}, "position": {"x": 550, "y": 550}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "find-lead-1"},
    {"from": "find-lead-1", "to": "condition-1"},
    {"from": "condition-1", "to": "activity-1"},
    {"from": "condition-1", "to": "update-1"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "activity_type", "type": "select", "description": "Type of follow-up activity", "required": true, "default": "call", "options": ["call", "email", "meeting", "task"]},
    {"name": "activity_subject", "type": "string", "description": "Subject for the follow-up activity", "required": true, "default": "Follow up with qualified lead"}
  ]'::jsonb,
  ARRAY['Qualify leads automatically', 'Create follow-up tasks for sales', 'Lead scoring automation'],
  true
) ON CONFLICT DO NOTHING;

-- Template 3: Lead to Opportunity Conversion
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'Lead to Opportunity Pipeline',
  'Converts incoming leads to opportunities and creates an introduction activity.',
  'sales_pipeline',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "create-lead-1", "type": "create_lead", "config": {"field_mappings": [{"lead_field": "first_name", "webhook_field": "first_name"}, {"lead_field": "last_name", "webhook_field": "last_name"}, {"lead_field": "email", "webhook_field": "email"}, {"lead_field": "company", "webhook_field": "company"}]}, "position": {"x": 400, "y": 250}},
    {"id": "create-opp-1", "type": "create_opportunity", "config": {"name": "{{opportunity_name}}", "stage": "{{initial_stage}}", "amount": "{{deal_amount}}"}, "position": {"x": 400, "y": 400}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "call", "subject": "Introduction call - {{company}}", "related_type": "opportunity", "related_field": "created_opportunity.id"}, "position": {"x": 400, "y": 550}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "create-lead-1"},
    {"from": "create-lead-1", "to": "create-opp-1"},
    {"from": "create-opp-1", "to": "activity-1"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "opportunity_name", "type": "string", "description": "Name template for opportunity (supports {{company}})", "required": true, "default": "New Deal - {{company}}"},
    {"name": "initial_stage", "type": "select", "description": "Initial pipeline stage", "required": true, "default": "prospecting", "options": ["prospecting", "qualification", "proposal", "negotiation"]},
    {"name": "deal_amount", "type": "number", "description": "Default deal amount", "required": false, "default": "0"}
  ]'::jsonb,
  ARRAY['Automate lead to opportunity conversion', 'Create sales pipeline entries', 'Schedule intro calls automatically'],
  true
) ON CONFLICT DO NOTHING;

-- Template 4: External API Notification
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'External Webhook Notification',
  'Sends lead data to an external API/webhook when triggered.',
  'integrations',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "http-1", "type": "http_request", "config": {"method": "POST", "url": "{{webhook_url}}", "body_type": "raw", "body": "{{request_body}}"}, "position": {"x": 400, "y": 300}}
  ]'::jsonb,
  '[{"from": "trigger-1", "to": "http-1"}]'::jsonb,
  'webhook',
  '[
    {"name": "webhook_url", "type": "url", "description": "External webhook URL to send data to", "required": true, "default": ""},
    {"name": "request_body", "type": "json", "description": "JSON body template (supports {{field}} variables)", "required": true, "default": "{\"email\": \"{{email}}\", \"name\": \"{{first_name}} {{last_name}}\"}"}
  ]'::jsonb,
  ARRAY['Send data to Slack', 'Integrate with external CRM', 'Notify third-party systems', 'Zapier/Make integration'],
  true
) ON CONFLICT DO NOTHING;

-- Template 5: Account Health Check
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'Account Health Check Activity',
  'Creates a periodic health check activity for accounts based on revenue threshold.',
  'account_management',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "find-account-1", "type": "find_account", "config": {"search_field": "name", "search_value": "{{account_name}}"}, "position": {"x": 400, "y": 250}},
    {"id": "condition-1", "type": "condition", "config": {"field": "found_account.annual_revenue", "operator": "greater_than", "value": "{{revenue_threshold}}"}, "position": {"x": 400, "y": 400}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "meeting", "subject": "{{meeting_subject}}", "related_type": "account", "related_field": "found_account.id"}, "position": {"x": 250, "y": 550}},
    {"id": "activity-2", "type": "create_activity", "config": {"type": "task", "subject": "Review account health", "related_type": "account", "related_field": "found_account.id"}, "position": {"x": 550, "y": 550}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "find-account-1"},
    {"from": "find-account-1", "to": "condition-1"},
    {"from": "condition-1", "to": "activity-1"},
    {"from": "condition-1", "to": "activity-2"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "revenue_threshold", "type": "number", "description": "Revenue threshold for high-value accounts", "required": true, "default": "100000"},
    {"name": "meeting_subject", "type": "string", "description": "Subject for executive review meeting", "required": true, "default": "Quarterly Executive Review"}
  ]'::jsonb,
  ARRAY['Enterprise account reviews', 'High-value customer touchpoints', 'Periodic health checks'],
  true
) ON CONFLICT DO NOTHING;

-- Template 6: AI Outbound Call (CallFluent)
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'AI Outbound Call (CallFluent)',
  'Initiates an AI-powered outbound call via CallFluent when triggered. The AI agent calls the contact with specified talking points.',
  'ai_calling',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "find-contact-1", "type": "find_contact", "config": {"search_field": "email", "search_value": "{{email}}"}, "position": {"x": 400, "y": 250}},
    {"id": "call-1", "type": "initiate_call", "config": {"provider": "callfluent", "phone_number": "{{phone}}", "purpose": "{{call_purpose}}", "talking_points": ["{{talking_point_1}}", "{{talking_point_2}}"]}, "position": {"x": 400, "y": 400}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "call", "subject": "AI Call Initiated - {{call_purpose}}", "related_type": "contact", "related_field": "found_contact.id"}, "position": {"x": 400, "y": 550}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "find-contact-1"},
    {"from": "find-contact-1", "to": "call-1"},
    {"from": "call-1", "to": "activity-1"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "call_purpose", "type": "string", "description": "Main objective for the AI call", "required": true, "default": "Follow up on recent inquiry"},
    {"name": "talking_point_1", "type": "string", "description": "First key point for AI to discuss", "required": true, "default": "Thank them for their interest"},
    {"name": "talking_point_2", "type": "string", "description": "Second key point for AI to discuss", "required": false, "default": "Schedule a demo or meeting"}
  ]'::jsonb,
  ARRAY['AI-powered sales calls', 'Automated follow-up calls', 'Lead outreach', 'Appointment scheduling'],
  true
) ON CONFLICT DO NOTHING;

-- Template 7: AI Outbound Call (Thoughtly)
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'AI Outbound Call (Thoughtly)',
  'Initiates an AI-powered outbound call via Thoughtly when triggered. The AI agent calls the contact with specified talking points.',
  'ai_calling',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "find-contact-1", "type": "find_contact", "config": {"search_field": "email", "search_value": "{{email}}"}, "position": {"x": 400, "y": 250}},
    {"id": "call-1", "type": "initiate_call", "config": {"provider": "thoughtly", "phone_number": "{{phone}}", "purpose": "{{call_purpose}}", "talking_points": ["{{talking_point_1}}", "{{talking_point_2}}"]}, "position": {"x": 400, "y": 400}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "call", "subject": "AI Call Initiated - {{call_purpose}}", "related_type": "contact", "related_field": "found_contact.id"}, "position": {"x": 400, "y": 550}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "find-contact-1"},
    {"from": "find-contact-1", "to": "call-1"},
    {"from": "call-1", "to": "activity-1"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "call_purpose", "type": "string", "description": "Main objective for the AI call", "required": true, "default": "Follow up on recent inquiry"},
    {"name": "talking_point_1", "type": "string", "description": "First key point for AI to discuss", "required": true, "default": "Thank them for their interest"},
    {"name": "talking_point_2", "type": "string", "description": "Second key point for AI to discuss", "required": false, "default": "Schedule a demo or meeting"}
  ]'::jsonb,
  ARRAY['AI-powered sales calls', 'Automated follow-up calls', 'Lead outreach', 'Appointment scheduling'],
  true
) ON CONFLICT DO NOTHING;

-- Template 8: Lead Qualification Call
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'Lead Qualification AI Call',
  'Automatically calls new leads to qualify them. AI agent gathers information and updates lead status based on conversation.',
  'lead_qualification',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "find-lead-1", "type": "find_lead", "config": {"search_field": "email", "search_value": "{{email}}"}, "position": {"x": 400, "y": 200}},
    {"id": "condition-1", "type": "condition", "config": {"field": "found_lead.phone", "operator": "exists", "value": ""}, "position": {"x": 400, "y": 300}},
    {"id": "call-1", "type": "initiate_call", "config": {"provider": "{{provider}}", "phone_number": "{{phone}}", "purpose": "Qualify lead and understand their needs", "talking_points": ["Introduce yourself and company", "Ask about their current challenges", "Gauge interest and timeline", "Offer next steps if interested"]}, "position": {"x": 250, "y": 450}},
    {"id": "update-1", "type": "update_lead", "config": {"field_mappings": [{"lead_field": "status", "webhook_field": "contacted"}]}, "position": {"x": 250, "y": 600}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "task", "subject": "Review AI call results for lead", "related_type": "lead", "related_field": "found_lead.id"}, "position": {"x": 550, "y": 450}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "find-lead-1"},
    {"from": "find-lead-1", "to": "condition-1"},
    {"from": "condition-1", "to": "call-1"},
    {"from": "condition-1", "to": "activity-1"},
    {"from": "call-1", "to": "update-1"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "provider", "type": "select", "description": "AI calling provider to use", "required": true, "default": "callfluent", "options": ["callfluent", "thoughtly"]}
  ]'::jsonb,
  ARRAY['Automated lead qualification', 'First contact automation', 'Speed to lead', 'AI SDR'],
  true
) ON CONFLICT DO NOTHING;

-- Template 9: Opportunity Follow-up Call
INSERT INTO workflow_template (name, description, category, template_nodes, template_connections, trigger_type, parameters, use_cases, is_system)
VALUES (
  'Opportunity Follow-up AI Call',
  'Triggers an AI call when an opportunity reaches a specific stage to advance the deal.',
  'sales_pipeline',
  '[
    {"id": "trigger-1", "type": "webhook_trigger", "config": {}, "position": {"x": 400, "y": 100}},
    {"id": "find-contact-1", "type": "find_contact", "config": {"search_field": "email", "search_value": "{{contact_email}}"}, "position": {"x": 400, "y": 200}},
    {"id": "call-1", "type": "initiate_call", "config": {"provider": "{{provider}}", "phone_number": "{{phone}}", "purpose": "{{call_purpose}}", "talking_points": ["Reference our last conversation", "Address any concerns or questions", "{{custom_talking_point}}", "Confirm next steps and timeline"]}, "position": {"x": 400, "y": 350}},
    {"id": "activity-1", "type": "create_activity", "config": {"type": "call", "subject": "AI Follow-up Call - {{opportunity_name}}", "related_type": "contact", "related_field": "found_contact.id"}, "position": {"x": 400, "y": 500}}
  ]'::jsonb,
  '[
    {"from": "trigger-1", "to": "find-contact-1"},
    {"from": "find-contact-1", "to": "call-1"},
    {"from": "call-1", "to": "activity-1"}
  ]'::jsonb,
  'webhook',
  '[
    {"name": "provider", "type": "select", "description": "AI calling provider", "required": true, "default": "callfluent", "options": ["callfluent", "thoughtly"]},
    {"name": "call_purpose", "type": "string", "description": "Main objective for the call", "required": true, "default": "Follow up on proposal and answer questions"},
    {"name": "custom_talking_point", "type": "string", "description": "Custom talking point for this call", "required": false, "default": "Discuss pricing and ROI"}
  ]'::jsonb,
  ARRAY['Deal acceleration', 'Proposal follow-up', 'Sales pipeline automation', 'Close rate improvement'],
  true
) ON CONFLICT DO NOTHING;