-- Migration 146: Email Templates
-- Adds email_template table for reusable AI email templates that combine
-- structured template input with live CRM and thread context.

CREATE TABLE IF NOT EXISTS email_template (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID,                          -- NULL for system templates, UUID for tenant-specific
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) DEFAULT 'general', -- general, follow_up, introduction, proposal, etc.

  -- Template content with {{variable}} placeholders
  subject_template TEXT NOT NULL,           -- e.g. "Follow up: {{company}} partnership"
  body_prompt TEXT NOT NULL,                -- AI prompt with placeholders and instructions

  -- Allowed entity types this template applies to (NULL = all)
  entity_types TEXT[] DEFAULT NULL,         -- e.g. '{lead,contact,account}'

  -- Template variables definition
  -- Each: { name, type, description, required, default }
  variables JSONB NOT NULL DEFAULT '[]',

  -- Metadata
  is_system BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_email_template_tenant ON email_template(tenant_id);
CREATE INDEX IF NOT EXISTS idx_email_template_category ON email_template(category);
CREATE INDEX IF NOT EXISTS idx_email_template_active ON email_template(is_active);
CREATE INDEX IF NOT EXISTS idx_email_template_system ON email_template(is_system);

-- Enable RLS
ALTER TABLE email_template ENABLE ROW LEVEL SECURITY;

-- RLS Policies: system templates readable by all, tenant templates scoped
DROP POLICY IF EXISTS email_template_select ON email_template;
CREATE POLICY email_template_select ON email_template
  FOR SELECT USING (
    is_system = true
    OR tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS email_template_insert ON email_template;
CREATE POLICY email_template_insert ON email_template
  FOR INSERT WITH CHECK (
    tenant_id::text = current_setting('app.tenant_id', true)
  );

DROP POLICY IF EXISTS email_template_update ON email_template;
CREATE POLICY email_template_update ON email_template
  FOR UPDATE USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_system = false
  );

DROP POLICY IF EXISTS email_template_delete ON email_template;
CREATE POLICY email_template_delete ON email_template
  FOR DELETE USING (
    tenant_id::text = current_setting('app.tenant_id', true)
    AND is_system = false
  );

-- Seed a few system templates
INSERT INTO email_template (id, tenant_id, name, description, category, subject_template, body_prompt, entity_types, variables, is_system, is_active)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    NULL,
    'Professional Follow-Up',
    'A polished follow-up email after an initial meeting or call',
    'follow_up',
    'Following up on our conversation, {{first_name}}',
    'Write a professional follow-up email to {{first_name}} at {{company}}. Reference our recent conversation and express continued interest. Tone: warm but professional. Keep it concise — under 150 words.',
    '{lead,contact}',
    '[{"name":"meeting_topic","type":"text","description":"Brief topic of the previous meeting","required":false,"default":"our recent discussion"}]',
    true,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    NULL,
    'Introduction Email',
    'Introduce yourself or your company to a new prospect',
    'introduction',
    'Introduction from {{sender_name}} — {{company}}',
    'Write a friendly introduction email to {{first_name}} at {{company}}. Briefly introduce who we are and why we are reaching out. Mention any relevant context from CRM notes. Tone: approachable and genuine. Under 200 words.',
    '{lead,bizdev_source}',
    '[{"name":"value_proposition","type":"text","description":"Key value proposition to highlight","required":false,"default":""}]',
    true,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    NULL,
    'Thank You After Meeting',
    'Send a thank-you email after a meeting or demo',
    'follow_up',
    'Thank you for your time, {{first_name}}',
    'Write a genuine thank-you email to {{first_name}} at {{company}} after a meeting. Reference any specific topics discussed from CRM notes. Include a brief mention of next steps if applicable. Tone: sincere and professional. Under 120 words.',
    '{lead,contact,account}',
    '[{"name":"next_steps","type":"text","description":"Agreed next steps from the meeting","required":false,"default":""}]',
    true,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    NULL,
    'Proposal Follow-Up',
    'Follow up after sending a proposal or quote',
    'proposal',
    'Regarding your proposal — {{company}}',
    'Write a follow-up email to {{first_name}} at {{company}} regarding a proposal we sent. Ask if they have any questions, gently nudge toward a decision without being pushy. Reference any recent communications for context. Tone: confident but not aggressive. Under 150 words.',
    '{contact,account,opportunity}',
    '[{"name":"proposal_date","type":"text","description":"When the proposal was sent","required":false,"default":"recently"}]',
    true,
    true
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    NULL,
    'Re-Engagement',
    'Reach out to a quiet or dormant contact',
    'outreach',
    'It has been a while, {{first_name}}',
    'Write a re-engagement email to {{first_name}} at {{company}} who we have not heard from in a while. Be warm and curious — ask how things are going. Avoid being guilt-trippy. Offer value or a reason to reconnect. Tone: friendly and low-pressure. Under 120 words.',
    '{lead,contact}',
    '[]',
    true,
    true
  )
ON CONFLICT (id) DO NOTHING;

-- RPC function to atomically increment usage count
CREATE OR REPLACE FUNCTION increment_email_template_usage(template_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE email_template
  SET usage_count = usage_count + 1, updated_at = NOW()
  WHERE id = template_id;
END;
$$;
