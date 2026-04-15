-- 152_fix_campaign_tables_tenant_id_uuid.sql
-- Fix: ai_campaign_targets and ai_campaign_events were created with tenant_id TEXT
-- in migration 091. All tenant_id columns must be UUID to match the rest of the schema.
-- Both tables are empty so no USING cast data loss risk.

ALTER TABLE ai_campaign_targets
  ALTER COLUMN tenant_id TYPE UUID USING tenant_id::uuid;

ALTER TABLE ai_campaign_events
  ALTER COLUMN tenant_id TYPE UUID USING tenant_id::uuid;
