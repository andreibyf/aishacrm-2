-- Migration 140: Replace plain related_id index with composite (tenant_id, related_id)
-- =====================================================================
-- The existing idx_activities_related_id is btree(related_id) only.
-- Activities queries always filter by tenant_id first, so a composite
-- index is more selective and avoids an additional index lookup.
-- The partial WHERE clause excludes the ~30% of rows with NULL related_id.
-- =====================================================================

-- Drop the plain single-column index
DROP INDEX IF EXISTS public.idx_activities_related_id;

-- Create the composite partial index
-- NOTE: Cannot use CONCURRENTLY inside a transaction, so this runs as plain DDL.
-- On a small-to-medium table this is fine; on large tables consider running
-- CONCURRENTLY manually outside of the migration runner.
CREATE INDEX IF NOT EXISTS idx_activities_tenant_related_id
  ON public.activities (tenant_id, related_id)
  WHERE related_id IS NOT NULL;
