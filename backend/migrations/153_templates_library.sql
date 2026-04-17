-- Migration 153: Structured Templates Library
-- Adds tenant-scoped structured templates for email-first rendering.

CREATE TABLE IF NOT EXISTS templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('email', 'sms', 'call_script')),
  template_json JSONB NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_templates_tenant_id ON templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_templates_tenant_type ON templates(tenant_id, type);
CREATE INDEX IF NOT EXISTS idx_templates_is_active ON templates(is_active);

CREATE OR REPLACE FUNCTION public.update_templates_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS templates_updated_at_trigger ON templates;
CREATE TRIGGER templates_updated_at_trigger
BEFORE UPDATE ON templates
FOR EACH ROW
EXECUTE FUNCTION public.update_templates_updated_at();

ALTER TABLE templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS templates_select ON templates;
CREATE POLICY templates_select ON templates
  FOR SELECT
  USING (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS templates_insert ON templates;
CREATE POLICY templates_insert ON templates
  FOR INSERT
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS templates_update ON templates;
CREATE POLICY templates_update ON templates
  FOR UPDATE
  USING (tenant_id::text = current_setting('app.tenant_id', true))
  WITH CHECK (tenant_id::text = current_setting('app.tenant_id', true));

DROP POLICY IF EXISTS templates_delete ON templates;
CREATE POLICY templates_delete ON templates
  FOR DELETE
  USING (tenant_id::text = current_setting('app.tenant_id', true));

-- Example email template scaffold for dev/test tenants.
INSERT INTO templates (tenant_id, name, type, template_json, is_active)
SELECT
  t.id,
  'Structured Outreach Intro',
  'email',
  '{
    "type": "email",
    "version": 1,
    "blocks": [
      { "type": "text", "content": "Hi {{contact_name}}," },
      { "type": "image", "url": "https://example.com/banner.png", "alt": "Banner" },
      { "type": "text", "content": "We''d love to help {{company}} improve workflows." },
      { "type": "button", "text": "Book a Call", "url": "{{booking_link}}" },
      { "type": "divider" },
      { "type": "text", "content": "Best regards,\nAiSHA CRM" }
    ]
  }'::jsonb,
  true
FROM tenant t
WHERE NOT EXISTS (
  SELECT 1
  FROM templates existing
  WHERE existing.tenant_id = t.id
    AND existing.name = 'Structured Outreach Intro'
);