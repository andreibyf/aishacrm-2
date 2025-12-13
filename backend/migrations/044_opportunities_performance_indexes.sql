-- Migration 044: Add performance indexes for opportunities queries
-- Optimizes queries using keyset pagination and proper sort orders
-- Aligns with query optimization guidance for indexed scans

-- Expected query patterns:
-- 1. List opportunities: WHERE tenant_id = $1 AND stage = $2 ORDER BY updated_at DESC, id DESC
-- 2. Stats aggregation: WHERE tenant_id = $1 GROUP BY stage
-- 3. Keyset pagination: WHERE tenant_id = $1 AND stage = $2 AND (updated_at, id) < ($cursor)

-- Composite index for tenant + stage + sort fields
-- Supports: WHERE tenant_id = X AND stage = Y ORDER BY updated_at DESC, id DESC
-- This enables index-only scans without table lookups for pagination queries
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_stage_updated 
ON opportunities (tenant_id, stage, updated_at DESC, id DESC);

-- Composite index for tenant + updated_at (for "all stages" queries)
-- Supports: WHERE tenant_id = X ORDER BY updated_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_updated 
ON opportunities (tenant_id, updated_at DESC, id DESC);

-- Composite index for tenant + assigned_to + updated_at (for employee scope queries)
-- Supports: WHERE tenant_id = X AND assigned_to = Y ORDER BY updated_at DESC, id DESC
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_assigned_updated 
ON opportunities (tenant_id, assigned_to, updated_at DESC, id DESC);

-- Composite index for tenant + is_test_data + updated_at (for filtering test data)
-- Supports: WHERE tenant_id = X AND (is_test_data = false OR is_test_data IS NULL)
CREATE INDEX IF NOT EXISTS idx_opportunities_tenant_test_updated 
ON opportunities (tenant_id, is_test_data, updated_at DESC, id DESC);

-- Analyze the table to update statistics for query planner
ANALYZE opportunities;

-- Performance notes:
-- 1. Indexes are ordered with equality predicates first (tenant_id, stage, assigned_to)
-- 2. Sort columns come last (updated_at DESC, id DESC) to match ORDER BY
-- 3. Keyset pagination using (updated_at, id) < (cursor) will use these indexes efficiently
-- 4. Server-side aggregation for stats uses idx_opportunities_tenant_stage_updated
-- 5. COUNT queries use index-only scans with these indexes

-- Query plan verification (run in psql to verify):
-- EXPLAIN ANALYZE 
-- SELECT * FROM opportunities 
-- WHERE tenant_id = 'your-tenant-uuid' AND stage = 'prospecting' 
-- ORDER BY updated_at DESC, id DESC 
-- LIMIT 25;
-- 
-- Expected: Index Only Scan using idx_opportunities_tenant_stage_updated
-- Should NOT see: Seq Scan or Sort operations
