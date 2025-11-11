# Migration 036 Application Guide

## Overview
Migration 036 is a hardening cleanup that removes any lingering `ai_campaign` (singular) table remnants after the consolidation in migration 035.

## Why This Migration?
- **Defense-in-depth**: Prevents accidental table resurrection from baseline replays
- **Migration safety**: Ensures migrations 032/033 won't fail if run after 035
- **Schema consistency**: Enforces use of canonical `ai_campaigns` (plural) table

## Prerequisites
✅ Migration 035 should already be applied (consolidates ai_campaign → ai_campaigns)
✅ Supabase project access with SQL Editor permissions
✅ No active queries against `ai_campaign` table

## Application Methods

### Method 1: Supabase SQL Editor (RECOMMENDED)
1. Navigate to your Supabase project: https://app.supabase.com/project/ehjlenywplgyiahgxkfj
2. Go to **SQL Editor** in the left sidebar
3. Click **New Query**
4. Copy the contents of `backend/migrations/036_cleanup_ai_campaign_residue.sql`
5. Paste into the editor
6. Click **Run** (or press Ctrl+Enter)
7. Verify output shows:
   ```
   NOTICE: ai_campaign table does not exist (expected after migration 035)
   ```

### Method 2: Direct PostgreSQL Connection
⚠️ Requires DATABASE_URL to be uncommented in `backend/.env`

```bash
# 1. Uncomment DATABASE_URL in backend/.env
# DATABASE_URL=postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres

# 2. Run the migration runner
node backend/apply-supabase-migrations.js

# 3. Re-comment DATABASE_URL after migration (optional)
```

### Method 3: Manual psql (Advanced)
```bash
psql "postgresql://postgres:YOUR_PASSWORD@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres" \
  -f backend/migrations/036_cleanup_ai_campaign_residue.sql
```

## Verification Queries
Run these in Supabase SQL Editor to confirm cleanup:

```sql
-- 1. Verify ai_campaign table is gone
SELECT tablename FROM pg_tables WHERE tablename = 'ai_campaign';
-- Expected: 0 rows

-- 2. Verify no stray indexes
SELECT indexname FROM pg_indexes WHERE indexname LIKE '%ai_campaign%';
-- Expected: 0 rows

-- 3. Verify no stray policies
SELECT policyname FROM pg_policies WHERE tablename = 'ai_campaign';
-- Expected: 0 rows

-- 4. Verify ai_campaigns (plural) exists and is healthy
SELECT id, name, status, metadata FROM ai_campaigns LIMIT 5;
-- Expected: Successful query (0 rows if no data yet)
```

## Expected Output
When migration runs successfully, you should see:
```
NOTICE: ai_campaign table does not exist (expected after migration 035)
```

If the table somehow exists (rare), you'll see:
```
NOTICE: Dropping legacy ai_campaign table
```

## Rollback (Not Recommended)
⚠️ **There is NO rollback** - this migration permanently removes the legacy table.
If you need to restore, you would need to:
1. Restore from backup
2. Re-run migrations 009-034 (skipping 035-036)

## Troubleshooting

### Error: "permission denied for table ai_campaign"
**Cause**: You're using ANON key instead of SERVICE_ROLE key
**Fix**: Ensure Supabase SQL Editor is authenticated with your project credentials

### Error: "relation 'ai_campaign' does not exist"
**Cause**: Migration 035 already dropped the table (expected state)
**Fix**: This is normal - migration 036 will complete with a NOTICE message

### No output/Silent success
**Cause**: PostgreSQL by default suppresses NOTICE messages
**Fix**: This is fine - run verification queries to confirm

## Integration with CI/CD
✅ A CI lint check has been added to `.github/workflows/lint.yml` that will fail builds if:
- Any code references `ai_campaign` (singular) outside approved migration files
- Helps prevent accidental table resurrection

## Related Files
- `backend/migrations/035_consolidate_ai_campaigns.sql` - Original consolidation
- `backend/migrations/032_normalize_foreign_keys.sql` - Now has IF EXISTS guards
- `scripts/lint-check-ai-campaign.ps1` - CI enforcement script
- `supabase/migrations/20251029233356_remote_schema.sql` - Baseline with DEPRECATED markers

## Support
If you encounter issues:
1. Check `docker logs aishacrm-backend` for errors
2. Verify Supabase project is accessible
3. Review migration 035 status (should show ai_campaigns exists)
4. Contact: app@base44.com for legacy migration questions
