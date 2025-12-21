-- Migration: Add composite index for leads tenant/account lookups
-- Rationale: CRM routes filter by tenant UUID first; composite index better
-- than a standalone account_id index in a multi-tenant schema.
-- Note: CREATE INDEX CONCURRENTLY cannot run inside a transaction.

-- Safe to run multiple times
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_account
  ON public.leads(tenant_id, account_id);

-- Optional: If you frequently sort by created_at within a tenant, consider a covering variant
-- CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_leads_tenant_created_at
--   ON public.leads(tenant_id, created_at DESC);
