# FK Constraints Migration Guide

**Important**: All database access must use Supabase API (`backend/lib/supabase-db.js`), not direct SQL execution.

## Migration Purpose

This migration adds Foreign Key constraints to enable V2 API denormalized field joins:
- `assigned_to_name` (joins to employees table)
- `account_name` (joins to accounts table)  
- `contact_name` (joins to contacts table)

Constraints added:
- `leads.assigned_to → employees.id`
- `contacts.assigned_to → employees.id`
- `contacts.account_id → accounts.id`
- `opportunities.assigned_to → employees.id`
- `opportunities.account_id → accounts.id`
- `opportunities.contact_id → contacts.id`
- `activities.assigned_to → employees.id`
- `accounts.assigned_to → employees.id`

## How to Apply

### Option 1: Via Supabase Dashboard (Recommended)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Select your project (aishacrm)
3. Open **SQL Editor**
4. Create a new query
5. Copy contents from `supabase/migrations/20251218_add_fk_constraints_simplified.sql`
6. Click **Run**
7. Verify all constraints created successfully

### Option 2: Via Migration Runner Script

```bash
# View the SQL without executing
doppler run -- node backend/apply-migration-fk-constraints.js

# The script outputs the SQL ready for manual execution in Supabase SQL Editor
```

### Option 3: Via Direct PostgreSQL Connection (Advanced)

```bash
# Only if you have direct PostgreSQL access (not recommended for production)
psql "postgresql://postgres:PASSWORD@your-project.supabase.co:5432/postgres?sslmode=require" \
  < supabase/migrations/20251218_add_fk_constraints_simplified.sql
```

## Verification

After applying the migration, verify constraints were created:

```sql
-- Check FK constraints
SELECT constraint_name, table_name, column_name
FROM information_schema.key_column_usage
WHERE constraint_name LIKE '%_assigned_to%' OR constraint_name LIKE '%_account_id%' OR constraint_name LIKE '%_contact_id%'
ORDER BY table_name, column_name;

-- Check indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE indexname LIKE 'idx_%_assigned_to%' OR indexname LIKE 'idx_%_account_id%' OR indexname LIKE 'idx_%_contact_id%'
ORDER BY tablename, indexname;
```

## Why Supabase API?

- ✅ **REST API compatible**: Works with Supabase's PostgREST service
- ✅ **Automatic denormalization**: FK constraints enable automatic joins
- ✅ **RLS aware**: Constraints respect Row-Level Security policies
- ✅ **No pooler conflicts**: Avoids direct connection pooler issues
- ✅ **Consistent with architecture**: Uses `backend/lib/supabase-db.js`

## Related Files

- `backend/apply-migration-fk-constraints.js` - Migration runner script
- `supabase/migrations/20251218_add_fk_constraints_simplified.sql` - Clean SQL migration
- `supabase/migrations/20251218_add_fk_constraints.sql` - Original complex version
- `backend/lib/supabase-db.js` - Supabase API abstraction layer
