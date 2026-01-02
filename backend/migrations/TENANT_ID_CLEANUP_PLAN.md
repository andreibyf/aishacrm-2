# Legacy Tenant ID Cleanup Plan

## ⚠️ DOCUMENT STATUS: PLANNING ONLY - MIGRATIONS NOT YET APPLIED

**Last Updated:** January 2026

**Current Status:**
- ✅ Phase 1: COMPLETE - All application code uses `tenant_id` (UUID)
- ⏳ Phase 2: PENDING - Index migration (110_replace_legacy_indexes.sql)
- ⏳ Phase 3: PENDING - RLS policy migration (111_replace_legacy_rls_policies.sql)
- ⏳ Phase 4: PENDING - Column cleanup (112_drop_legacy_tenant_columns.sql)

**Purpose of this document:**
- Planning roadmap for completing the tenant UUID migration
- Reference for understanding legacy column deprecation
- Deployment guide when migrations are ready to apply

**Active code status:**
- ✅ No backend routes reference `tenant_id_text` or `tenant_id_legacy`
- ✅ No frontend code references legacy columns
- ✅ All new migrations use `tenant_id` (UUID) pattern
- ⚠️ Database schema still contains deprecated columns (nullable)
- ⚠️ Some indexes and RLS policies still use deprecated columns

---

## ⚠️ CRITICAL: Multi-Environment Deployment

**This migration MUST be applied to BOTH databases:**
1. **Development Database** (aishacrm_dev or local instance)
2. **Production Database** (aishacrm_prod)

**REQUIRED SEQUENCE:**
- ✅ Apply to Dev FIRST
- ✅ Test thoroughly in Dev (2-3 days minimum)
- ✅ Generate deployment report
- ✅ Only then apply to Production

**DO NOT skip Dev testing - RLS and indexes are security/performance critical!**

---

## Executive Summary

**Technical Debt:** Legacy tenant ID columns (`tenant_id_text`, `tenant_id_legacy`) are still present in:
- **100+ indexes** (performance overhead)
- **13+ RLS policies** (security surface using deprecated columns)
- **50+ tables** with nullable legacy columns
- Migration scripts and backfill utilities

**Target State:** All code uses `tenant_id` (UUID FK → `tenant(id)`), zero references to legacy columns.

---

## Current State Audit

### 1. Legacy Column Presence

| Column Name | Tables Affected | Status |
|-------------|----------------|--------|
| `tenant_id_text` | 40+ tables | Made nullable (migration 096) |
| `tenant_id_legacy` | bizdev_sources, system_logs | Made nullable (migration 099) |
| `tenant_id` (UUID) | All tables | ✅ Active, FK to tenant(id) |

### 2. Indexes Using Legacy Columns (Critical)

**File:** `backend/migrations/dev_functions_export.sql`

**Count:** 100+ indexes reference `tenant_id_text`

**Examples:**
```sql
CREATE INDEX idx_accounts_tenant ON accounts USING btree (tenant_id_text);
CREATE INDEX idx_leads_tenant ON leads USING btree (tenant_id_text);
CREATE INDEX idx_activities_tenant ON activities USING btree (tenant_id_text);
CREATE INDEX idx_contacts_tenant ON contacts USING btree (tenant_id_text);
CREATE INDEX idx_opportunities_tenant ON opportunities USING btree (tenant_id_text);
-- ... 95+ more
```

**Performance Impact:**
- Indexes consume ~500MB+ disk space (estimate)
- INSERT/UPDATE operations maintain unused indexes
- Query planner may choose wrong index

### 3. RLS Policies Using Legacy Columns (Security Risk)

**File:** `backend/migrations/dev_functions_export.sql`

**Count:** 13 RLS policies reference `tenant_id_text`

**Examples:**
```sql
CREATE POLICY tenant_isolation_accounts ON accounts 
  USING (tenant_id_text = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_leads ON leads 
  USING (tenant_id_text = current_setting('app.current_tenant_id', true));

CREATE POLICY tenant_isolation_activities ON activities 
  USING (tenant_id_text = current_setting('app.current_tenant_id', true));
-- ... 10+ more
```

**Security Concern:**
- RLS enforcement relies on deprecated column
- If `tenant_id_text` becomes NULL (data corruption), RLS fails open
- Inconsistent with new code using `tenant_id` (UUID)

### 4. Tables with Legacy Columns

**From migrations 096, 099:**
- leads
- accounts
- contacts
- opportunities
- activities
- note
- ai_campaign
- workflow
- webhook
- bizdev_sources
- system_logs
- notifications
- modulesettings
- ... (40+ total)

### 5. Backfill Scripts Still Referencing Legacy

**Files:**
- `backend/check-uuid-backfill-needed.js` (reads tenant_id_text)
- `backend/check-backfill-needed.sql` (counts tenant_id_text)
- `backend/migrations/105_backfill_utility_tables_tenant_uuid.sql`

**Purpose:** One-time migration utilities (safe to archive after cutover)

---

## Migration Strategy

### Phase 1: Pre-Cutover Validation ✅ (DONE)

**Completed:**
- ✅ All tables have `tenant_id` (UUID) column
- ✅ All new code uses `tenant_id` exclusively
- ✅ Legacy columns made nullable (migrations 096, 099)
- ✅ Backfill scripts executed (migration 105)

**Verification Command:**
```sql
-- Check for NULL tenant_id with non-NULL tenant_id_text
SELECT table_name, 
       COUNT(*) FILTER (WHERE tenant_id IS NULL AND tenant_id_text IS NOT NULL) as needs_backfill
FROM (
  SELECT 'accounts' as table_name, tenant_id, tenant_id_text FROM accounts
  UNION ALL
  SELECT 'leads', tenant_id, tenant_id_text FROM leads
  UNION ALL
  SELECT 'contacts', tenant_id, tenant_id_text FROM contacts
  -- ... etc
) t
GROUP BY table_name
HAVING COUNT(*) FILTER (WHERE tenant_id IS NULL AND tenant_id_text IS NOT NULL) > 0;
```

**Expected Result:** 0 rows (all backfills complete)

---

### Phase 2: Index Migration (HIGH PRIORITY)

**Goal:** Replace 100+ `tenant_id_text` indexes with `tenant_id` (UUID) indexes

**Impact:**
- ✅ Queries use correct column
- ✅ Reduce index bloat
- ⚠️ Requires schema locks (brief downtime or low-traffic window)

**Migration File:** `110_replace_legacy_indexes.sql`

**Strategy:**
```sql
-- Pattern: Drop old index, create new index concurrently

-- Example 1: Simple tenant isolation index
DROP INDEX IF EXISTS idx_accounts_tenant;
CREATE INDEX CONCURRENTLY idx_accounts_tenant_uuid 
  ON accounts USING btree (tenant_id);

-- Example 2: Composite indexes
DROP INDEX IF EXISTS idx_accounts_assigned_to;
CREATE INDEX CONCURRENTLY idx_accounts_assigned_to_uuid 
  ON accounts USING btree (tenant_id, assigned_to);

-- Example 3: Conditional indexes
DROP INDEX IF EXISTS idx_leads_do_not_call;
CREATE INDEX CONCURRENTLY idx_leads_do_not_call_uuid 
  ON leads USING btree (tenant_id, do_not_call) 
  WHERE do_not_call = true;
```

**Automation Script:** `backend/generate-index-migration.js`
```javascript
// Reads dev_functions_export.sql, generates index replacement SQL
// Output: 110_replace_legacy_indexes.sql
```

**Tables Affected (40+):**
accounts, activities, ai_campaign, apikey, archive_index, audit_log, 
bizdev_source, bizdev_sources, cash_flow, checkpoint, client_requirement, 
contacts, daily_sales_metrics, email_template, employees, field_customization, 
file, import_log, leads, modulesettings, note, notifications, opportunities, 
workflow, workflow_execution, etc.

**Estimated Rows Impacted:** ~10M+ across all tables

**Deployment (BOTH Environments):**

**Development First:**
1. Backup dev database: `pg_dump -Fc aishacrm_dev > backup_dev_$(date +%Y%m%d).dump`
2. Apply migration: `psql -d aishacrm_dev -f 110_replace_legacy_indexes.sql`
3. Verify indexes created successfully
4. Run integration tests
5. Create deployment report

**Production (After Dev Success):**
1. Schedule maintenance window (2am-5am UTC)
2. Backup prod database: `pg_dump -Fc aishacrm_prod > backup_prod_$(date +%Y%m%d).dump`
3. Apply migration: `psql -d aishacrm_prod -f 110_replace_legacy_indexes.sql`
4. Use `CREATE INDEX CONCURRENTLY` (no table locks)
5. Drop old indexes after verification
6. Monitor query performance for 24h minimum

---

### Phase 3: RLS Policy Migration (CRITICAL SECURITY)

**Goal:** Update 13 RLS policies to use `tenant_id` (UUID) instead of `tenant_id_text`

**Impact:**
- ✅ Security hardened (UUID-based isolation)
- ✅ Consistent with application code
- ⚠️ Requires ALTER POLICY (brief locks)

**Migration File:** `111_replace_legacy_rls_policies.sql`

**Pattern:**
```sql
-- Drop old policy
DROP POLICY IF EXISTS tenant_isolation_accounts ON accounts;

-- Create new policy using tenant_id (UUID)
CREATE POLICY tenant_isolation_accounts_uuid ON accounts
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_uuid 
      FROM users 
      WHERE id = auth.uid()
    )
  );
```

**Tables Requiring RLS Update:**
1. accounts
2. activities
3. bizdev_source
4. cash_flow
5. client_requirement
6. contacts
7. leads
8. note
9. notifications
10. opportunities
11. workflow
12. workflow_execution
13. synchealth

**Special Cases:**

**Superadmin Bypass:**
```sql
-- Allow superadmin to see all tenants
CREATE POLICY tenant_isolation_accounts_uuid ON accounts
  FOR ALL TO authenticated
  USING (
    tenant_id IN (
      SELECT tenant_uuid FROM users WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND role = 'superadmin'
    )
  );
```

**Cross-Tenant Access (for specific features):**
```sql
-- Allow cross-tenant access for integrations
CREATE POLICY tenant_isolation_synchealth_uuid ON synchealth
  FOR ALL TO authenticated
  USING (
    tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid())
    OR current_setting('app.bypass_rls', true) = 'true'
  );
```

**Testing:**
```sql
-- Set user context
SET app.current_user_id = '<user-uuid>';

-- Verify RLS enforcement
SELECT * FROM accounts; -- Should only see own tenant

-- Test superadmin
SET app.current_user_id = '<superadmin-uuid>';
SELECT * FROM accounts; -- Should see all tenants
```

---

### Phase 4: Column Removal (FINAL CUTOVER)

**Goal:** Drop `tenant_id_text` and `tenant_id_legacy` columns from all tables

**Prerequisites:**
- ✅ Phase 2 complete (indexes migrated)
- ✅ Phase 3 complete (RLS policies migrated)
- ✅ Verify zero code references to legacy columns
- ✅ Backup database before execution

**Migration File:** `112_drop_legacy_tenant_columns.sql`

**Pattern:**
```sql
-- Drop tenant_id_text from all tables
ALTER TABLE accounts DROP COLUMN IF EXISTS tenant_id_text;
ALTER TABLE leads DROP COLUMN IF EXISTS tenant_id_text;
ALTER TABLE contacts DROP COLUMN IF EXISTS tenant_id_text;
-- ... (40+ tables)

-- Drop tenant_id_legacy from specific tables
ALTER TABLE bizdev_sources DROP COLUMN IF EXISTS tenant_id_legacy;
ALTER TABLE system_logs DROP COLUMN IF EXISTS tenant_id_legacy;
```

**Verification:**
```sql
-- Check for any remaining legacy columns
SELECT table_name, column_name
FROM information_schema.columns
WHERE column_name IN ('tenant_id_text', 'tenant_id_legacy')
  AND table_schema = 'public';
```

**Expected Result:** 0 rows

**Rollback Plan:**
- Keep database backup for 30 days
- Re-add columns with NULL values if needed (emergency only)

---

## Verification & Testing

### Pre-Deployment Checklist

**REQUIRED: Run on BOTH Development and Production Databases**

**Code Audit:**
```bash
# Search for any remaining legacy column references
grep -r "tenant_id_text" backend/routes/
grep -r "tenant_id_legacy" backend/routes/
grep -r "tenant_id_text" src/

# Expected: 0 matches (all should use tenant_id)
```

**Database State (Run on Dev FIRST, then Prod):**
```sql
-- 1. Verify all rows have tenant_id populated
SELECT 'accounts' as tbl, COUNT(*) FILTER (WHERE tenant_id IS NULL) as nulls FROM accounts
UNION ALL
SELECT 'leads', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM leads
UNION ALL
SELECT 'contacts', COUNT(*) FILTER (WHERE tenant_id IS NULL) FROM contacts;
-- Expected: 0 nulls (MUST PASS on Dev before running on Prod)

-- 2. Verify tenant_id references valid tenant
SELECT 'accounts' as tbl, COUNT(*) as invalid FROM accounts a
  LEFT JOIN tenant t ON a.tenant_id = t.id
  WHERE a.tenant_id IS NOT NULL AND t.id IS NULL
UNION ALL
SELECT 'leads', COUNT(*) FROM leads l
  LEFT JOIN tenant t ON l.tenant_id = t.id
  WHERE l.tenant_id IS NOT NULL AND t.id IS NULL;
-- Expected: 0 invalid (MUST PASS on Dev before running on Prod)

-- 3. Environment identification
SELECT current_database(), current_setting('app.environment', true) as environment;
-- Verify you're connected to the correct database!
```

**Migration Checklist (Per Environment):**

**Development Database:**
- [ ] Backup dev database
- [ ] Run pre-deployment validation queries
- [ ] Apply migration (110, 111, or 112)
- [ ] Run post-deployment validation
- [ ] Integration tests pass
- [ ] Create validation report for prod deployment

**Production Database:**
- [ ] Review dev validation report
- [ ] Backup prod database (full dump)
- [ ] Schedule maintenance window (2am-5am UTC)
- [ ] Notify team via Slack #deployments
- [ ] Run pre-deployment validation queries
- [ ] Apply migration during window
- [ ] Run post-deployment validation
- [ ] Monitor for 24 hours minimum
- [ ] Sign-off from team lead

**Performance Test:**
```sql
-- Before migration: Query using tenant_id_text index
EXPLAIN ANALYZE SELECT * FROM accounts WHERE tenant_id_text = 'demo-tenant';

-- After migration: Query using tenant_id UUID index
EXPLAIN ANALYZE SELECT * FROM accounts WHERE tenant_id = '<uuid>';

-- Compare: Index Scan costs should be similar or better
```

### Post-Deployment Validation

**1. Index Coverage:**
```sql
-- Verify all tenant_id columns have indexes
SELECT tablename, indexname
FROM pg_indexes
WHERE indexdef LIKE '%tenant_id%'
  AND indexdef NOT LIKE '%tenant_id_text%'
  AND indexdef NOT LIKE '%tenant_id_legacy%'
ORDER BY tablename;
```

**2. RLS Policy Check:**
```sql
-- Verify RLS policies use tenant_id (UUID)
SELECT tablename, policyname, definition
FROM pg_policies
WHERE definition LIKE '%tenant_id%'
  AND definition NOT LIKE '%tenant_id_text%'
  AND definition NOT LIKE '%tenant_id_legacy%';
```

**3. Application Test:**
```bash
# Run integration tests
cd backend && npm test

# Run E2E tests
npm run test:e2e

# Verify no errors related to tenant_id_text
```

**4. Production Smoke Test:**
```bash
# Login as regular user → should see own tenant data only
curl -X GET https://api.aishacrm.com/api/accounts \
  -H "Authorization: Bearer <user-token>"

# Login as superadmin → should see all tenant data
curl -X GET https://api.aishacrm.com/api/accounts \
  -H "Authorization: Bearer <superadmin-token>"
```

---

## Deployment Timeline

**Estimated Total: 4 weeks**

| Phase | Duration | Blocker Dependencies |
|-------|----------|---------------------|
| Phase 1: Validation | DONE | ✅ Complete |
| Phase 2: Index Migration | 1 week | Low-traffic deployment window |
| Phase 3: RLS Policy Migration | 1 week | Phase 2 complete + testing |
| Phase 4: Column Removal | 2 weeks | Phase 3 complete + 1 week observation |

**CRITICAL: Multi-Environment Deployment**

All phases MUST be applied to BOTH environments:
1. **Development Database** (local + hosted dev)
2. **Production Database**

**Critical Path (Per Environment):**

**Week 1: Development Environment**
1. Generate migration scripts (1 day)
2. Apply Phase 2 to local dev database (1 hour)
3. Test queries, verify indexes used (2 days)
4. Apply Phase 2 to hosted dev database (1 hour)
5. Run integration tests (1 day)
6. Validation report (1 day)

**Week 2: Production Phase 2 + Dev Phase 3**
1. Deploy Phase 2 to production (1 hour, 2am-5am UTC)
2. Monitor production performance (7 days)
3. Apply Phase 3 to dev database (1 hour)
4. Test RLS enforcement (2 days)
5. Security audit in dev (2 days)

**Week 3: Production Phase 3 + Dev Phase 4**
1. Deploy Phase 3 to production (1 hour, 2am-5am UTC)
2. Monitor production auth logs (7 days)
3. Apply Phase 4 to dev database (1 hour)
4. Test column absence (2 days)
5. Full regression in dev (2 days)

**Week 4: Production Phase 4**
1. Final production backup (1 hour)
2. Deploy Phase 4 to production (1 hour, 2am-5am UTC)
3. Verification tests (3 hours)
4. Monitor for 7 days
5. Archive backfill scripts (1 day)

---

## Rollback Procedures

### If Index Migration Fails (Phase 2)

```sql
-- Drop new UUID indexes
DROP INDEX CONCURRENTLY IF EXISTS idx_accounts_tenant_uuid;
DROP INDEX CONCURRENTLY IF EXISTS idx_leads_tenant_uuid;
-- ...

-- Recreate old indexes (if accidentally dropped)
CREATE INDEX idx_accounts_tenant ON accounts (tenant_id_text);
CREATE INDEX idx_leads_tenant ON leads (tenant_id_text);
-- ...
```

### If RLS Policy Migration Fails (Phase 3)

```sql
-- Drop new UUID policies
DROP POLICY IF EXISTS tenant_isolation_accounts_uuid ON accounts;
DROP POLICY IF EXISTS tenant_isolation_leads_uuid ON leads;
-- ...

-- Recreate old policies
CREATE POLICY tenant_isolation_accounts ON accounts
  USING (tenant_id_text = current_setting('app.current_tenant_id', true));
-- ...
```

### If Column Removal Fails (Phase 4)

**Restore from backup:**
```bash
# Restore full database backup (last resort)
pg_restore -d aishacrm_production backup_before_phase4.dump

# Or restore specific table
pg_restore -d aishacrm_production -t accounts backup_before_phase4.dump
```

---

## Success Metrics

**Technical:**
- ✅ Zero `tenant_id_text` or `tenant_id_legacy` references in database schema
- ✅ All indexes use `tenant_id` (UUID)
- ✅ All RLS policies use `tenant_id` (UUID)
- ✅ Query performance maintained or improved
- ✅ No RLS bypass incidents

**Business:**
- ✅ Zero downtime deployments
- ✅ No data corruption incidents
- ✅ Reduced database size by ~500MB (index cleanup)
- ✅ Improved query performance (UUID indexes more selective)

---

## Automation Scripts Needed

1. **Generate Index Migration:**
   - Input: `dev_functions_export.sql`
   - Output: `110_replace_legacy_indexes.sql`
   - Logic: Parse CREATE INDEX statements, replace `tenant_id_text` → `tenant_id`

2. **Generate RLS Migration:**
   - Input: `dev_functions_export.sql`
   - Output: `111_replace_legacy_rls_policies.sql`
   - Logic: Parse CREATE POLICY statements, replace `tenant_id_text` → `tenant_id`

3. **Generate Column Drop Migration:**
   - Input: Database schema introspection
   - Output: `112_drop_legacy_tenant_columns.sql`
   - Logic: Query `information_schema.columns`, generate ALTER TABLE statements

4. **Validation Script:**
   - Input: Database connection
   - Output: Report of remaining legacy references
   - Logic: Check schema, indexes, policies, application code

---

## Next Steps

**Immediate (This Sprint):**
1. ✅ Review this plan with team
2. ⏳ Create automation scripts (1-2 days)
3. ⏳ Generate Phase 2 migration (110_replace_legacy_indexes.sql)
4. ⏳ Test in local environment

**Next Sprint:**
1. Deploy Phase 2 to staging
2. Performance testing
3. Deploy Phase 2 to production (low-traffic window)

**Future Sprints:**
1. Deploy Phase 3 (RLS policies)
2. Observation period (1 week)
3. Deploy Phase 4 (column removal)
4. Archive backfill scripts

**Contact:** Development Team Lead for deployment coordination
**Risk Level:** Medium (managed with staged rollout)
**Business Impact:** Low (zero user-facing changes)
