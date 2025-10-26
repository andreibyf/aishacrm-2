-- ============================================
-- FIX: Function Search Path Security
-- ============================================
-- Supabase Linter Warning: Functions should have immutable search_path
-- to prevent search_path hijacking attacks.
--
-- This migration adds SECURITY DEFINER and SET search_path to all functions
-- identified by the Supabase linter.

-- ============================================
-- Fix: current_tenant_id function
-- ============================================
DROP FUNCTION IF EXISTS public.current_tenant_id() CASCADE;

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN current_setting('app.current_tenant_id', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.current_tenant_id() IS 'Returns the current tenant_id from session variable';

-- ============================================
-- Fix: sync_bizdev_sources_created_date function
-- ============================================
DROP FUNCTION IF EXISTS public.sync_bizdev_sources_created_date() CASCADE;

CREATE OR REPLACE FUNCTION public.sync_bizdev_sources_created_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_date IS NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_bizdev_sources_created_date() IS 'Trigger function to sync created_date from created_at';

-- Recreate trigger if it exists
DROP TRIGGER IF EXISTS trigger_sync_bizdev_sources_created_date ON bizdev_sources;
CREATE TRIGGER trigger_sync_bizdev_sources_created_date
  BEFORE INSERT OR UPDATE ON bizdev_sources
  FOR EACH ROW
  EXECUTE FUNCTION sync_bizdev_sources_created_date();

-- ============================================
-- Fix: update_tenant_updated_at function
-- ============================================
DROP FUNCTION IF EXISTS public.update_tenant_updated_at() CASCADE;

CREATE OR REPLACE FUNCTION public.update_tenant_updated_at()
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

COMMENT ON FUNCTION public.update_tenant_updated_at() IS 'Trigger function to auto-update updated_at timestamp';

-- Recreate trigger if it exists
DROP TRIGGER IF EXISTS tenant_updated_at_trigger ON tenant;
CREATE TRIGGER tenant_updated_at_trigger
  BEFORE UPDATE ON tenant
  FOR EACH ROW
  EXECUTE FUNCTION update_tenant_updated_at();

-- ============================================
-- Fix: sync_created_date function
-- ============================================
DROP FUNCTION IF EXISTS public.sync_created_date() CASCADE;

CREATE OR REPLACE FUNCTION public.sync_created_date()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.created_at IS NOT NULL AND NEW.created_date IS NULL THEN
    NEW.created_date = NEW.created_at::date;
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.sync_created_date() IS 'Generic trigger function to sync created_date from created_at';

-- ============================================
-- VERIFICATION
-- ============================================
-- Check that all functions now have search_path set
SELECT 
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as arguments,
  CASE 
    WHEN p.prosecdef THEN 'SECURITY DEFINER'
    ELSE 'SECURITY INVOKER'
  END as security,
  p.proconfig as config_settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND p.proname IN (
    'current_tenant_id',
    'sync_bizdev_sources_created_date', 
    'update_tenant_updated_at',
    'sync_created_date'
  )
ORDER BY p.proname;

-- Expected output: All functions should show:
-- security = 'SECURITY DEFINER'
-- config_settings = '{search_path=public}'
