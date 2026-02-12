-- Migration 139: Optimize funnel materialized-view refresh triggers
-- =====================================================================
-- PROBLEM: refresh_funnel_on_change() calls
--   REFRESH MATERIALIZED VIEW CONCURRENTLY dashboard_funnel_counts
-- and fires on EVERY INSERT/UPDATE/DELETE across 4 tables (accounts,
-- contacts, leads, opportunities). Each DML event triggers a full
-- matview refresh — extremely expensive and redundant when many rows
-- change in quick succession.
--
-- FIXES:
-- 1. Add pg_try_advisory_xact_lock() debounce so concurrent refreshes
--    in the same transaction window skip instead of queuing.
-- 2. Replace triggers with narrower versions:
--    - accounts:      AFTER INSERT OR DELETE only (no UPDATE)
--    - contacts:      AFTER INSERT OR DELETE only (no UPDATE)
--    - leads:         AFTER INSERT OR DELETE OR UPDATE OF status
--    - opportunities: AFTER INSERT OR DELETE OR UPDATE OF stage
-- =====================================================================

BEGIN;

-- ── 1. Replace the function with a debounced version ──
CREATE OR REPLACE FUNCTION public.refresh_funnel_on_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  -- Non-blocking: if another session is already refreshing, skip.
  -- This prevents N concurrent DML operations from each triggering
  -- a full matview refresh.
  IF NOT pg_try_advisory_xact_lock(hashtext('refresh_dashboard_funnel')) THEN
    RETURN NULL;
  END IF;

  REFRESH MATERIALIZED VIEW CONCURRENTLY public.dashboard_funnel_counts;
  RETURN NULL;
EXCEPTION
  WHEN OTHERS THEN
    -- Silently swallow errors (e.g., lock contention, missing view)
    -- to avoid blocking the triggering DML operation.
    RETURN NULL;
END;
$$;

-- ── 2. Narrow the trigger scope per table ──

-- accounts: only INSERT/DELETE affect funnel counts (no status/stage column)
DROP TRIGGER IF EXISTS trg_refresh_funnel_accounts ON public.accounts;
CREATE TRIGGER trg_refresh_funnel_accounts
  AFTER INSERT OR DELETE ON public.accounts
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_funnel_on_change();

-- contacts: only INSERT/DELETE affect funnel counts
DROP TRIGGER IF EXISTS trg_refresh_funnel_contacts ON public.contacts;
CREATE TRIGGER trg_refresh_funnel_contacts
  AFTER INSERT OR DELETE ON public.contacts
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_funnel_on_change();

-- leads: INSERT/DELETE + status changes affect funnel
DROP TRIGGER IF EXISTS trg_refresh_funnel_leads ON public.leads;
CREATE TRIGGER trg_refresh_funnel_leads
  AFTER INSERT OR DELETE OR UPDATE OF status ON public.leads
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_funnel_on_change();

-- opportunities: INSERT/DELETE + stage changes affect funnel
DROP TRIGGER IF EXISTS trg_refresh_funnel_opportunities ON public.opportunities;
CREATE TRIGGER trg_refresh_funnel_opportunities
  AFTER INSERT OR DELETE OR UPDATE OF stage ON public.opportunities
  FOR EACH STATEMENT
  EXECUTE FUNCTION refresh_funnel_on_change();

COMMIT;
