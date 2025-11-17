-- Upsert a tenant row for test-tenant-001 so AI snapshot can resolve it
INSERT INTO tenant (tenant_id, name, status, subscription_tier, branding_settings, metadata)
VALUES ('test-tenant-001', 'Test Reporting Tenant', 'active', 'free', '{}'::jsonb, '{"seed":"reporting"}'::jsonb)
ON CONFLICT (tenant_id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  subscription_tier = EXCLUDED.subscription_tier,
  updated_at = NOW();
