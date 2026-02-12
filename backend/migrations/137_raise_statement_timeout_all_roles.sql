-- Migration 137: Raise statement_timeout for authenticated and service_role
-- Problem: PostgREST inherits the role's statement_timeout (default 8s on Supabase)
--          This causes DELETE/INSERT/UPDATE to fail on all entities (accounts, contacts, etc.)
-- Fix:     Raise to 30s for authenticated, 60s for service_role
--          This is a global fix — no need for per-entity SECURITY DEFINER functions

-- Check current settings first (for audit log)
DO $$
DECLARE
  auth_config text[];
  svc_config  text[];
BEGIN
  SELECT rolconfig INTO auth_config FROM pg_roles WHERE rolname = 'authenticated';
  SELECT rolconfig INTO svc_config  FROM pg_roles WHERE rolname = 'service_role';
  RAISE NOTICE 'BEFORE: authenticated rolconfig = %', auth_config;
  RAISE NOTICE 'BEFORE: service_role  rolconfig = %', svc_config;
END $$;

-- Raise statement_timeout for authenticated role (used by PostgREST for user requests)
ALTER ROLE authenticated SET statement_timeout = '30s';

-- Raise statement_timeout for service_role (used by backend service key)
ALTER ROLE service_role SET statement_timeout = '60s';

-- Verify
DO $$
DECLARE
  auth_config text[];
  svc_config  text[];
BEGIN
  SELECT rolconfig INTO auth_config FROM pg_roles WHERE rolname = 'authenticated';
  SELECT rolconfig INTO svc_config  FROM pg_roles WHERE rolname = 'service_role';
  RAISE NOTICE 'AFTER: authenticated rolconfig = %', auth_config;
  RAISE NOTICE 'AFTER: service_role  rolconfig = %', svc_config;
END $$;
