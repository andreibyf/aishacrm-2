# Database Migration Guide for AI Assistants

**Last Updated:** February 4, 2026  
**Audience:** AI coding assistants (Claude, Copilot, etc.)

## Critical Architecture Facts

### Two Separate Supabase Projects (NOT Branches)

This repository uses **TWO COMPLETELY SEPARATE SUPABASE PROJECTS**:

1. **Production (main):**
   - Project ID: `ehjlenywplgyiahgxkfj`
   - URL: `https://ehjlenywplgyiahgxkfj.supabase.co`
   - Database Host: `db.ehjlenywplgyiahgxkfj.supabase.co`
   - Password: `Aml834VyYYH6humU`

2. **Dev/QA (preview):**
   - Project ID: `efzqxjpfewkrgpdootte`
   - URL: `https://efzqxjpfewkrgpdootte.supabase.co`
   - Database Host: `db.efzqxjpfewkrgpdootte.supabase.co`
   - Password: `Aml834VyYYH6humU` (SAME as production)

**IMPORTANT:** These are NOT database branches. They are separate Supabase projects with independent data.

### Connection Strings

```bash
# Production
postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres

# Dev/QA
postgresql://postgres:Aml834VyYYH6humU@db.efzqxjpfewkrgpdootte.supabase.co:5432/postgres
```

## Migration File Locations

All migration SQL files are stored in:
```
backend/migrations/
```

Naming convention: `NNN_descriptive_name.sql` where NNN is a sequential number (e.g., `120_fix_remaining_security_issues.sql`)

## Execution Method

### Recommended: psql (Cross-platform, Direct SQL)

```bash
cd backend/migrations

# Execute on production
psql "postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres" -f YOUR_MIGRATION.sql

# Execute on dev/QA
psql "postgresql://postgres:Aml834VyYYH6humU@db.efzqxjpfewkrgpdootte.supabase.co:5432/postgres" -f YOUR_MIGRATION.sql
```

### Alternative: Node.js Runner (Handles SSL automatically)

Use `run-migration.js` if psql is unavailable:

```bash
node run-migration.js YOUR_MIGRATION.sql "postgresql://postgres:PASSWORD@db.PROJECT.supabase.co:5432/postgres"
```

## Standard Migration Scripts

The repository includes two template scripts:

### 1. run-NNN.sh (Single migration runner)

```bash
#!/usr/bin/env bash
set -euo pipefail

# Project references (DO NOT CHANGE)
export SB_PROJECT=ehjlenywplgyiahgxkfj         # Production
export SB_PROJECT_DEV=efzqxjpfewkrgpdootte    # Dev/QA

# SQL file to execute
SQL_FILE="./YOUR_MIGRATION.sql"

# Database connection strings
export MAIN_DB_URL="postgresql://postgres:Aml834VyYYH6humU@db.${SB_PROJECT}.supabase.co:5432/postgres"
export DEV_DB_URL="postgresql://postgres:Aml834VyYYH6humU@db.${SB_PROJECT_DEV}.supabase.co:5432/postgres"

# Branches to apply migration to (space-separated)
BRANCHES="main dev"

for BR in $BRANCHES; do
  echo "=========================================="
  echo "Running Migration on branch: $BR"
  echo "=========================================="
  
  if [ "$BR" = "main" ]; then
    DB_URL="$MAIN_DB_URL"
  else
    DB_URL="$DEV_DB_URL"
  fi
  
  echo "Using psql with direct database connection..."
  psql "$DB_URL" -f "$SQL_FILE"
  
  if [ $? -eq 0 ]; then
    echo "✅ Migration completed successfully on $BR"
  else
    echo "❌ Migration failed on $BR"
    exit 1
  fi
done

echo ""
echo "🎉 Migration applied to all branches!"
```

### 2. run-both-migrations.sh (Sequential executor)

For running multiple migrations in sequence (e.g., 120 then 121):

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "Running migrations 120 and 121 sequentially..."

./run-120.sh
if [ $? -ne 0 ]; then
  echo "❌ Migration 120 failed. Stopping."
  exit 1
fi

./run-121.sh
if [ $? -ne 0 ]; then
  echo "❌ Migration 121 failed."
  exit 1
fi

echo "🎉 All migrations completed successfully!"
```

## Step-by-Step Migration Process

### 1. Create Migration File

```bash
cd backend/migrations
touch 122_your_migration_description.sql
```

### 2. Write SQL with Safety Guards

**ALWAYS make migrations idempotent** (safe to run multiple times):

```sql
-- Drop existing objects first
DROP VIEW IF EXISTS v_example_view CASCADE;
DROP FUNCTION IF EXISTS example_function() CASCADE;
DROP POLICY IF EXISTS example_policy ON table_name;

-- Then create
CREATE OR REPLACE VIEW v_example_view AS ...;
CREATE OR REPLACE FUNCTION example_function() RETURNS ... AS $$ ... $$ LANGUAGE plpgsql;
CREATE POLICY example_policy ON table_name ...;
```

### 3. Create Execution Script

Copy `run-120.sh` to `run-122.sh` and update the SQL_FILE variable:

```bash
cp run-120.sh run-122.sh
# Edit run-122.sh: Change SQL_FILE="./120_fix..." to SQL_FILE="./122_your..."
```

### 4. Test on Dev First (MANDATORY)

```bash
# Edit run-122.sh temporarily to only run on dev
BRANCHES="dev"

./run-122.sh
```

### 5. Verify in Supabase Dashboard

1. Go to https://efzqxjpfewkrgpdootte.supabase.co
2. Database → Schema → Verify objects created
3. Database → Linter → Check for security warnings

### 6. Execute on Production

If dev succeeds, run on both:

```bash
# Edit run-122.sh to run on both
BRANCHES="main dev"

./run-122.sh
```

### 7. Verify Both Databases

**Production:**
- Dashboard: https://ehjlenywplgyiahgxkfj.supabase.co
- Check Schema and Linter

**Dev/QA:**
- Dashboard: https://efzqxjpfewkrgpdootte.supabase.co
- Check Schema and Linter

### 8. Commit to Git

```bash
git add backend/migrations/122_your_migration.sql
git add backend/migrations/run-122.sh
git commit -m "Migration 122: Your description"
git push origin main
```

## Common Pitfalls and Solutions

### Issue: "password authentication failed"

**Cause:** Using wrong password or wrong project reference

**Solution:** 
- Verify password is `Aml834VyYYH6humU` for BOTH projects
- Check project IDs match: `ehjlenywplgyiahgxkfj` (main), `efzqxjpfewkrgpdootte` (dev)
- Do NOT use `db-dev.PROJECT` pattern (that's for database branches, not separate projects)

### Issue: "cannot change name of input parameter"

**Cause:** Function already exists with different parameter names

**Solution:**
```sql
-- Drop existing function first (with exact signature)
DROP FUNCTION IF EXISTS function_name(uuid) CASCADE;

-- Then create with new parameter names
CREATE OR REPLACE FUNCTION function_name(p_new_param_name uuid) ...
```

### Issue: "policy already exists"

**Cause:** Migration not idempotent

**Solution:**
```sql
-- ALWAYS use IF EXISTS
DROP POLICY IF EXISTS policy_name ON table_name;

-- Then create
CREATE POLICY policy_name ON table_name ...;
```

### Issue: "command not found: supabase"

**Cause:** Attempting to use Supabase CLI for migrations

**Solution:** 
- Do NOT use `supabase db execute` or `supabase db query`
- Use `psql` directly (bypasses CLI migration history tracking)
- This approach is intentional for cross-environment migrations

### Issue: IPv4 compatibility warning

**Ignore it.** Both main and dev show this warning. Connection still works.

### Issue: Migration partially succeeded with errors

**Common for batch migrations:**
- psql continues on errors by default
- Review error messages to identify which functions/views failed
- Create a follow-up migration (NNN+1) to fix the errors
- Use `DROP IF EXISTS` and `CREATE OR REPLACE` for safety

## Security Best Practices

### 1. Always Use SET search_path for Security

```sql
CREATE OR REPLACE FUNCTION example_function()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog  -- REQUIRED for SECURITY DEFINER
AS $$
BEGIN
  -- Function body
END;
$$;
```

### 2. SECURITY INVOKER for Views

```sql
CREATE OR REPLACE VIEW example_view
WITH (security_invoker = true)  -- Runs as calling user, not view owner
AS
SELECT ...;
```

### 3. Never Modify pgvector Extension Functions

**CRITICAL:** Do NOT modify functions with:
- Language: `c` (C-language)
- Schema: `public` 
- Name patterns: `*vec*`, `array_to_*`, `*_distance`, `*_product`, etc.

These are pgvector extension functions. Modifying them will break the database.

Only modify custom application functions (typically LANGUAGE `plpgsql`).

## Verification Checklist

After running migrations:

- [ ] Migration executed successfully on dev
- [ ] Migration executed successfully on main
- [ ] Supabase Linter shows 0 new security warnings (or reduced count)
- [ ] Application functions correctly (smoke test)
- [ ] Migration files committed to git
- [ ] Execution scripts committed to git

## Environment Variable Reference

For local/Docker development (not needed for migrations):

```bash
# Doppler Dev Config
DATABASE_URL=postgresql://postgres:Aml834VyYYH6humU@db.efzqxjpfewkrgpdootte.supabase.co:5432/postgres?sslmode=require

# Doppler Production Config  
DATABASE_URL=postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres?sslmode=require
```

Note: Doppler manages environment variables for running containers. For migrations, use the connection strings directly.

## Troubleshooting Commands

### Test database connectivity:

```bash
# Production
psql "postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres" -c "SELECT current_database(), current_user;"

# Dev/QA  
psql "postgresql://postgres:Aml834VyYYH6humU@db.efzqxjpfewkrgpdootte.supabase.co:5432/postgres" -c "SELECT current_database(), current_user;"
```

### Check function security settings:

```sql
SELECT 
  schemaname AS schema,
  proname AS function_name,
  pg_get_function_arguments(oid) AS arguments,
  COALESCE(proconfig::text, 'NOT SET') AS search_path_setting
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public'
  AND prokind = 'f'
  AND prolang != (SELECT oid FROM pg_language WHERE lanname = 'c')
ORDER BY proname;
```

### List all views and their security settings:

```sql
SELECT 
  schemaname,
  viewname,
  definition
FROM pg_views
WHERE schemaname = 'public'
ORDER BY viewname;
```

## Quick Reference for AI Assistants

**When user says "run migration on both databases":**

1. Verify migration file exists in `backend/migrations/NNN_*.sql`
2. Create or copy `run-NNN.sh` script with correct SQL_FILE
3. Set `BRANCHES="main dev"` in the script
4. Execute: `./run-NNN.sh`
5. Check for errors in output
6. Verify in both Supabase dashboards
7. Commit migration and script to git

**When user says "the password is the same for both":**

BELIEVE THEM. The password is `Aml834VyYYH6humU` for both production and dev/QA projects.

**When user says "separate projects" or "two Supabase projects":**

This means:
- NOT database branches
- Separate project IDs: `ehjlenywplgyiahgxkfj` (main) and `efzqxjpfewkrgpdootte` (dev)
- Connection pattern: `db.PROJECT_ID.supabase.co` (no `-dev` or `-preview` suffix)

**When migrations fail with authentication errors:**

1. Confirm password is exactly `Aml834VyYYH6humU` (uppercase U at end)
2. Confirm project IDs are correct
3. Ask user if password was recently changed in Supabase Dashboard
4. Do NOT suggest checking Doppler unless explicitly asked

## Migration History

Completed migrations (as of February 4, 2026):

- `120_fix_remaining_security_issues.sql` - ✅ Executed on both main and dev
- `121_supabase_ai_security_fixes.sql` - ✅ Executed on both main and dev (5 errors, 34/40 functions succeeded)

Next migration number: `122`
