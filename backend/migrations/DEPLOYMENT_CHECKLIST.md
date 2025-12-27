# Legacy Tenant ID Cleanup - Deployment Checklist

## Environment Connection Verification

**Before ANY migration, verify database connection:**

```bash
# Check current database
psql -c "SELECT current_database(), current_setting('app.environment', true);"

# Expected outputs:
# Dev:  current_database = 'aishacrm_dev'
# Prod: current_database = 'aishacrm_prod'
```

**If wrong database: STOP and reconnect!**

---

## Phase 2: Index Migration (110_replace_legacy_indexes.sql)

### Development Database

- [ ] **Step 1:** Backup database
  ```bash
  pg_dump -Fc -d aishacrm_dev -U postgres > backups/dev_before_phase2_$(date +%Y%m%d_%H%M%S).dump
  ```

- [ ] **Step 2:** Verify connection
  ```bash
  psql -d aishacrm_dev -c "SELECT current_database();"
  # Must show: aishacrm_dev
  ```

- [ ] **Step 3:** Run pre-deployment validation
  ```bash
  psql -d aishacrm_dev -f pre_deployment_validation.sql
  # All checks must pass (0 nulls, 0 invalid FKs)
  ```

- [ ] **Step 4:** Generate migration
  ```bash
  node backend/generate-index-migration.js
  # Output: backend/migrations/110_replace_legacy_indexes.sql
  ```

- [ ] **Step 5:** Review migration file
  ```bash
  cat backend/migrations/110_replace_legacy_indexes.sql | less
  # Verify DROP/CREATE statements look correct
  ```

- [ ] **Step 6:** Apply migration
  ```bash
  psql -d aishacrm_dev -f backend/migrations/110_replace_legacy_indexes.sql
  ```

- [ ] **Step 7:** Verify indexes created
  ```sql
  -- Run in psql
  SELECT indexname, tablename
  FROM pg_indexes
  WHERE indexdef LIKE '%tenant_id%'
    AND indexdef NOT LIKE '%tenant_id_text%'
    AND indexdef NOT LIKE '%tenant_id_legacy%'
  ORDER BY tablename;
  -- Should see ~100 new UUID indexes
  ```

- [ ] **Step 8:** Run integration tests
  ```bash
  cd backend && npm test
  npm run test:e2e
  ```

- [ ] **Step 9:** Performance test queries
  ```sql
  EXPLAIN ANALYZE SELECT * FROM accounts WHERE tenant_id = '<test-uuid>';
  -- Verify using idx_accounts_tenant_uuid
  ```

- [ ] **Step 10:** Create deployment report
  ```bash
  echo "Dev Phase 2 Complete: $(date)" >> deployment_log.txt
  echo "Indexes migrated: 100+" >> deployment_log.txt
  echo "Tests passed: YES/NO" >> deployment_log.txt
  ```

- [ ] **Step 11:** Team review (wait 24h minimum)

---

### Production Database

**Prerequisites:**
- [ ] Dev deployment successful
- [ ] All tests passing in Dev
- [ ] Team approval received
- [ ] Maintenance window scheduled (2am-5am UTC)

- [ ] **Step 1:** Backup database (CRITICAL!)
  ```bash
  pg_dump -Fc -d aishacrm_prod -U postgres > backups/prod_before_phase2_$(date +%Y%m%d_%H%M%S).dump
  # Verify backup size is reasonable (should be GBs)
  ls -lh backups/prod_before_phase2_*.dump
  ```

- [ ] **Step 2:** Notify team
  ```
  Message to #deployments Slack channel:
  "🚀 Starting Phase 2 index migration in PROD at $(date)"
  "Expected duration: 1-2 hours"
  "Maintenance window: 2am-5am UTC"
  ```

- [ ] **Step 3:** Verify connection (CRITICAL!)
  ```bash
  psql -d aishacrm_prod -c "SELECT current_database();"
  # MUST show: aishacrm_prod
  # If shows aishacrm_dev: STOP IMMEDIATELY!
  ```

- [ ] **Step 4:** Run pre-deployment validation
  ```bash
  psql -d aishacrm_prod -f pre_deployment_validation.sql
  # All checks must pass
  ```

- [ ] **Step 5:** Apply migration
  ```bash
  psql -d aishacrm_prod -f backend/migrations/110_replace_legacy_indexes.sql 2>&1 | tee migration_prod_phase2.log
  ```

- [ ] **Step 6:** Verify no errors in log
  ```bash
  grep -i error migration_prod_phase2.log
  # Should return 0 matches
  ```

- [ ] **Step 7:** Verify indexes created
  ```sql
  SELECT COUNT(*) FROM pg_indexes
  WHERE indexdef LIKE '%tenant_id%'
    AND indexdef NOT LIKE '%tenant_id_text%'
    AND indexdef NOT LIKE '%tenant_id_legacy%';
  -- Should be ~100
  ```

- [ ] **Step 8:** Smoke test queries
  ```sql
  -- Test with real tenant UUID from production
  EXPLAIN ANALYZE SELECT * FROM accounts 
  WHERE tenant_id = (SELECT id FROM tenant LIMIT 1);
  -- Should use UUID index
  ```

- [ ] **Step 9:** Monitor performance (24h)
  ```bash
  # Check slow query log
  tail -f /var/log/postgresql/slow_queries.log
  ```

- [ ] **Step 10:** Notify team
  ```
  Message to #deployments:
  "✅ Phase 2 index migration complete in PROD"
  "Monitoring for 24h before Phase 3"
  ```

---

## Phase 3: RLS Policy Migration (111_replace_legacy_rls_policies.sql)

### Development Database

- [ ] **Step 1:** Backup database
  ```bash
  pg_dump -Fc -d aishacrm_dev > backups/dev_before_phase3_$(date +%Y%m%d_%H%M%S).dump
  ```

- [ ] **Step 2:** Generate migration
  ```bash
  node backend/generate-rls-migration.js
  ```

- [ ] **Step 3:** Apply migration
  ```bash
  psql -d aishacrm_dev -f backend/migrations/111_replace_legacy_rls_policies.sql
  ```

- [ ] **Step 4:** Test RLS enforcement
  ```sql
  -- As regular user
  SET app.current_user_id = '<dev-user-uuid>';
  SELECT COUNT(*) FROM accounts;
  -- Should only see 1 tenant's data

  -- As superadmin
  SET app.current_user_id = '<superadmin-uuid>';
  SELECT COUNT(*) FROM accounts;
  -- Should see all tenants
  ```

- [ ] **Step 5:** Security audit
  ```bash
  cd backend && npm run test:security
  ```

- [ ] **Step 6:** Create deployment report

---

### Production Database

**Prerequisites:**
- [ ] Dev Phase 3 successful
- [ ] Phase 2 running stable for 7+ days
- [ ] Security tests passing in Dev

- [ ] **Step 1:** Backup database
  ```bash
  pg_dump -Fc -d aishacrm_prod > backups/prod_before_phase3_$(date +%Y%m%d_%H%M%S).dump
  ```

- [ ] **Step 2:** Notify team
  ```
  "🔒 Starting Phase 3 RLS migration in PROD"
  "SECURITY CRITICAL - monitoring auth closely"
  ```

- [ ] **Step 3:** Verify connection
  ```bash
  psql -d aishacrm_prod -c "SELECT current_database();"
  ```

- [ ] **Step 4:** Apply migration
  ```bash
  psql -d aishacrm_prod -f backend/migrations/111_replace_legacy_rls_policies.sql
  ```

- [ ] **Step 5:** Test with real users
  ```sql
  -- Use actual user UUIDs from production users table
  SET app.current_user_id = '<real-user-uuid>';
  SELECT COUNT(*) FROM accounts;
  -- Verify they only see their tenant
  ```

- [ ] **Step 6:** Monitor auth logs (7 days)
  ```bash
  tail -f /var/log/postgresql/auth.log | grep RLS
  ```

- [ ] **Step 7:** Notify team after 7 days
  ```
  "✅ Phase 3 stable for 7 days - ready for Phase 4"
  ```

---

## Phase 4: Column Removal (112_drop_legacy_tenant_columns.sql)

### Development Database

- [ ] **Step 1:** FULL backup (restore point!)
  ```bash
  pg_dump -Fc -d aishacrm_dev > backups/dev_before_phase4_FINAL_$(date +%Y%m%d_%H%M%S).dump
  ```

- [ ] **Step 2:** Verify backup
  ```bash
  pg_restore --list backups/dev_before_phase4_FINAL_*.dump | head -20
  ```

- [ ] **Step 3:** Apply column drops
  ```bash
  psql -d aishacrm_dev -f backend/migrations/112_drop_legacy_tenant_columns.sql
  ```

- [ ] **Step 4:** Verify columns gone
  ```sql
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE column_name IN ('tenant_id_text', 'tenant_id_legacy');
  -- Expected: 0 rows
  ```

- [ ] **Step 5:** Full regression tests
  ```bash
  npm run test:all
  ```

---

### Production Database

**Prerequisites:**
- [ ] Dev Phase 4 successful
- [ ] Phase 3 stable for 7+ days
- [ ] Full regression tests passing
- [ ] Final team approval

- [ ] **Step 1:** CRITICAL BACKUP
  ```bash
  pg_dump -Fc -d aishacrm_prod > backups/prod_before_phase4_FINAL_$(date +%Y%m%d_%H%M%S).dump
  
  # Also backup to offsite storage
  aws s3 cp backups/prod_before_phase4_FINAL_*.dump s3://aishacrm-backups/
  ```

- [ ] **Step 2:** Verify backup integrity
  ```bash
  pg_restore --list backups/prod_before_phase4_FINAL_*.dump | wc -l
  # Should show thousands of objects
  ```

- [ ] **Step 3:** Final team notification
  ```
  "🎯 FINAL PHASE: Dropping legacy tenant columns in PROD"
  "This is IRREVERSIBLE without restore"
  "Backup verified and uploaded to S3"
  ```

- [ ] **Step 4:** Verify connection (TRIPLE CHECK!)
  ```bash
  psql -d aishacrm_prod -c "SELECT current_database(), pg_database_size(current_database());"
  ```

- [ ] **Step 5:** Apply column drops
  ```bash
  psql -d aishacrm_prod -f backend/migrations/112_drop_legacy_tenant_columns.sql 2>&1 | tee migration_prod_phase4.log
  ```

- [ ] **Step 6:** Verify columns dropped
  ```sql
  SELECT table_name, column_name
  FROM information_schema.columns
  WHERE column_name IN ('tenant_id_text', 'tenant_id_legacy');
  -- Expected: 0 rows
  ```

- [ ] **Step 7:** Smoke tests
  ```bash
  curl -X GET https://api.aishacrm.com/health
  curl -X GET https://api.aishacrm.com/api/accounts -H "Authorization: Bearer <token>"
  ```

- [ ] **Step 8:** Monitor for 7 days
  ```bash
  # Watch error logs
  tail -f /var/log/app/backend.log | grep -i tenant
  ```

- [ ] **Step 9:** Final sign-off
  ```
  "✅ MIGRATION COMPLETE - Legacy tenant columns removed"
  "Backup retained for 30 days: backups/prod_before_phase4_FINAL_*.dump"
  "Monitoring continues for 7 days"
  ```

---

## Rollback Procedures

### If Phase 2 Fails (Indexes)

**Development:**
```bash
# Restore from backup
pg_restore -d aishacrm_dev backups/dev_before_phase2_*.dump

# Or manually drop new indexes
psql -d aishacrm_dev -c "DROP INDEX CONCURRENTLY idx_accounts_tenant_uuid;"
# ... repeat for all new indexes
```

**Production:**
```bash
# ONLY if critical failure - contact team lead first
pg_restore -d aishacrm_prod backups/prod_before_phase2_*.dump
```

### If Phase 3 Fails (RLS)

**Immediate rollback:**
```sql
-- Drop new policies
DROP POLICY tenant_isolation_accounts_uuid ON accounts;
-- ... repeat for all

-- Recreate old policies
CREATE POLICY tenant_isolation_accounts ON accounts
  USING (tenant_id_text = current_setting('app.current_tenant_id', true));
-- ... repeat for all
```

### If Phase 4 Fails (Column Drops)

**RESTORE FROM BACKUP ONLY:**
```bash
# This is irreversible without restore
pg_restore -c -d aishacrm_prod backups/prod_before_phase4_FINAL_*.dump
```

---

## Sign-Off

**Phase 2 Complete:**
- [ ] Dev: Signed by _______________ Date: ___________
- [ ] Prod: Signed by _______________ Date: ___________

**Phase 3 Complete:**
- [ ] Dev: Signed by _______________ Date: ___________
- [ ] Prod: Signed by _______________ Date: ___________

**Phase 4 Complete:**
- [ ] Dev: Signed by _______________ Date: ___________
- [ ] Prod: Signed by _______________ Date: ___________

**Final Cutover:**
- [ ] Team Lead Approval: _______________ Date: ___________
- [ ] Archive backfill scripts: _______________ Date: ___________
