#!/bin/bash
# Run Migration 122 - Fix SQL Errors from Migration 121
# Executes on both main (production) and dev databases

set -e  # Exit on error

# Import common config
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Load environment variables (assumes Doppler or .env available)
export SB_PROJECT="${SB_PROJECT:-ehjlenywplgyiahgxkfj}"
export SB_PROJECT_DEV="${SB_PROJECT_DEV:-efzqxjpfewkrgpdootte}"
export DB_PASSWORD="${DB_PASSWORD:-Aml834VyYYH6humU}"

# Database URLs
export MAIN_DB_URL="postgresql://postgres:${DB_PASSWORD}@db.${SB_PROJECT}.supabase.co:5432/postgres"
export DEV_DB_URL="postgresql://postgres:${DB_PASSWORD}@db.${SB_PROJECT_DEV}.supabase.co:5432/postgres"

# SQL file
SQL_FILE="${SCRIPT_DIR}/122_fix_security_fixes_errors.sql"

# Branches to update (really separate projects, not branches)
BRANCHES="main dev"

echo "================================================================"
echo "Migration 122: Fix SQL Errors from Migration 121"
echo "================================================================"
echo ""
echo "This migration fixes 5 SQL errors:"
echo "  1. employee_full_name - trim() syntax"
echo "  2. recompute_open_opportunities - coalesce type mismatch"
echo "  3. recompute_recent_documents - pg_catalog table reference"
echo "  4. update_phase3_suggestion_telemetry - extract() syntax"
echo "  5. refresh_assigned_to_* functions - parameter name conflicts"
echo ""

for branch in $BRANCHES; do
  echo "----------------------------------------"
  echo "Applying to: $branch"
  echo "----------------------------------------"
  
  if [ "$branch" = "main" ]; then
    DB_URL="$MAIN_DB_URL"
    echo "Database: Production (ehjlenywplgyiahgxkfj)"
  else
    DB_URL="$DEV_DB_URL"
    echo "Database: Dev/QA (efzqxjpfewkrgpdootte)"
  fi
  
  echo "Using psql with direct database connection..."
  psql "$DB_URL" -f "$SQL_FILE"
  
  if [ $? -eq 0 ]; then
    echo "✅ Migration 122 completed successfully on $branch"
  else
    echo "❌ Migration 122 failed on $branch"
    exit 1
  fi
  echo ""
done

echo "================================================================"
echo "🎉 Migration 122 applied to all branches!"
echo "================================================================"
echo ""
echo "Next Steps:"
echo "1. Verify functions have search_path set:"
echo "   psql \$MAIN_DB_URL -c \"SELECT proname, ..."
echo ""
echo "2. Test affected functions:"
echo "   SELECT employee_full_name(e) FROM employees e LIMIT 1;"
echo "   SELECT public.recompute_open_opportunities(...);"
echo ""
echo "3. Check Supabase Linter warnings (should be reduced)"
