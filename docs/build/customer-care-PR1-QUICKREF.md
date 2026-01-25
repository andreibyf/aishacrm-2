# Customer C.A.R.E. PR1 – Quick Reference Card

## Migration 116: Apply & Verify

### 1️⃣ Apply Migration

**Local PostgreSQL:**
```bash
psql -U postgres -d aishacrm -f backend/migrations/116_customer_care_state.sql
```

**Docker PostgreSQL:**
```bash
docker cp backend/migrations/116_customer_care_state.sql aishacrm-db:/tmp/
docker exec aishacrm-db psql -U postgres -d aishacrm -f /tmp/116_customer_care_state.sql
```

**Supabase (via CLI):**
```bash
supabase db push
```

**Supabase (via Dashboard):**
1. Go to Database → Migrations
2. Create new migration
3. Paste contents of `116_customer_care_state.sql`
4. Review diff → Apply

---

### 2️⃣ Run Smoke Tests

```bash
# PostgreSQL (transactional, auto-rollback)
psql -U postgres -d aishacrm -f backend/migrations/116_customer_care_state_smoke_test.sql

# Expected output: 10 tests, all PASS
```

---

### 3️⃣ Automated Verification

```bash
# Node.js script (uses Supabase client)
node backend/scripts/verify-pr1.js

# Expected output:
# Test 1: ✅ PASS
# Test 2: ✅ PASS
# Test 3: ✅ PASS
# Test 4: ✅ PASS
# Test 5: ✅ PASS
# Test 6: ✅ PASS
# ═════════════════════════════════
# ✅ All PR1 verification tests PASSED
```

---

### 4️⃣ Manual Verification (SQL)

```sql
-- Check tables exist
SELECT tablename FROM pg_tables 
WHERE tablename LIKE 'customer_care_state%';

-- Expected:
--  customer_care_state
--  customer_care_state_history

-- Check indexes
SELECT indexname FROM pg_indexes 
WHERE tablename = 'customer_care_state';

-- Expected: 4+ indexes

-- Check RLS enabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('customer_care_state', 'customer_care_state_history');

-- Expected: rowsecurity = t (true)

-- Insert test record
INSERT INTO customer_care_state (
    tenant_id,
    entity_type,
    entity_id,
    care_state
) VALUES (
    'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    'lead',
    'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    'evaluating'
) RETURNING id, hands_off_enabled;

-- Expected: hands_off_enabled = false

-- Cleanup
DELETE FROM customer_care_state 
WHERE entity_id = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
```

---

### 5️⃣ Rollback (if needed)

**⚠️ Only if migration causes issues**

```sql
-- Drop tables (safe, no dependencies yet)
DROP TABLE IF EXISTS public.customer_care_state_history CASCADE;
DROP TABLE IF EXISTS public.customer_care_state CASCADE;
```

**Note:** No rollback needed in normal circumstances. Tables are additive and unused until PR2+.

---

### 6️⃣ Confirm Zero Impact

```bash
# Check existing app behavior
# All existing features should work unchanged:
# - Lead creation/editing
# - Contact management
# - Account management
# - Activities
# - Dashboard

# No new UI elements
# No new API endpoints
# No new background jobs
```

---

## Troubleshooting

### Error: `pgcrypto` extension not found
```sql
-- Run before migration:
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Modern PostgreSQL (13+) includes `gen_random_uuid()` by default, so this is rarely needed.

### Error: Foreign key constraint fails
```sql
-- Check tenant table exists:
SELECT count(*) FROM public.tenant;

-- If tenant table missing, apply earlier migrations first
```

### Error: Permission denied
```bash
# Ensure you're using service role key (not anon key)
# For Supabase: use SUPABASE_SERVICE_ROLE_KEY
```

---

## Success Criteria

✅ Both tables created  
✅ All indexes present  
✅ RLS enabled  
✅ `hands_off_enabled` defaults to FALSE  
✅ Check constraints enforce valid values  
✅ Unique constraint prevents duplicates  
✅ No runtime behavior change  
✅ No errors in application logs  

---

**Status:** PR1 migration applied and verified  
**Next:** Ready for PR2 (State Engine implementation)
