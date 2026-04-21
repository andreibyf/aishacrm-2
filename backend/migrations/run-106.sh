#!/usr/bin/env bash
set -euo pipefail

# Project references (DO NOT CHANGE)
export SB_PROJECT=ehjlenywplgyiahgxkfj         # Production
export SB_PROJECT_DEV=efzqxjpfewkrgpdootte    # Dev/QA

# SQL file to execute
SQL_FILE="./106_field_customization.sql"

# Database connection strings - MUST be provided via environment variables
# Usage: MAIN_DB_URL="postgresql://..." DEV_DB_URL="postgresql://..." ./run-106.sh
# Or use Doppler: doppler run --project aishacrm --config prd_prd -- ./run-106.sh
if [ -z "${MAIN_DB_URL:-}" ] || [ -z "${DEV_DB_URL:-}" ]; then
  echo "ERROR: MAIN_DB_URL and DEV_DB_URL must be set via environment or Doppler"
  echo "Example: doppler run --project aishacrm --config prd_prd -- ./run-106.sh"
  exit 1
fi

# Branches to apply migration to (space-separated)
# Start with "dev" only for testing, then change to "main dev" for production
BRANCHES="dev"

for BR in $BRANCHES; do
  echo "=========================================="
  echo "Running Migration 106 on branch: $BR"
  echo "=========================================="
  
  if [ "$BR" = "main" ]; then
    DB_URL="$MAIN_DB_URL"
  else
    DB_URL="$DEV_DB_URL"
  fi
  
  echo "Using psql with direct database connection..."
  psql "$DB_URL" -f "$SQL_FILE"
  
  if [ $? -eq 0 ]; then
    echo "✅ Migration 106 completed successfully on $BR"
  else
    echo "❌ Migration 106 failed on $BR"
    exit 1
  fi
done

echo ""
echo "🎉 Migration 106 applied successfully!"
echo ""
echo "Next steps:"
echo "1. Verify in Supabase Dashboard: https://efzqxjpfewkrgpdootte.supabase.co"
echo "2. Check table exists: SELECT * FROM field_customization LIMIT 1;"
echo "3. If successful, edit this script: BRANCHES=\"main dev\""
echo "4. Run again to apply to production"
