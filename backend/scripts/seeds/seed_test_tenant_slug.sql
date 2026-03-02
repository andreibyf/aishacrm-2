-- Upsert a tenant row for 6cb4c008-4847-426a-9a2e-918ad70e7b69 so AI snapshot can resolve it
INSERT INTO tenant (tenant_id, name, status, subscription_tier, branding_settings, metadata)
VALUES ('6cb4c008-4847-426a-9a2e-918ad70e7b69', 'Test Reporting Tenant', 'active', 'free', '{}'::jsonb, '{"seed":"reporting"}'::jsonb)
ON CONFLICT (tenant_id) DO UPDATE SET
  name = EXCLUDED.name,
  status = EXCLUDED.status,
  subscription_tier = EXCLUDED.subscription_tier,
  updated_at = NOW();
