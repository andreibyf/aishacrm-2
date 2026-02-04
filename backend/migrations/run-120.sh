#!/usr/bin/env bash
set -euo pipefail

# Run Migration 120 on both dev and main branches
# Fixes: 8 SECURITY DEFINER views + 2 RLS disabled tables

export SB_PROJECT=ehjlenywplgyiahgxkfj
export SB_PROJECT_DEV=efzqxjpfewkrgpdootte
SQL_FILE="./120_fix_remaining_security_issues.sql"

# Database connection strings
# Main: Production database
# Dev: Separate dev/QA project
export MAIN_DB_URL="postgresql://postgres:Aml834VyYYH6humU@db.${SB_PROJECT}.supabase.co:5432/postgres"
export DEV_DB_URL="postgresql://postgres:Aml834VyYYH6humU@db.${SB_PROJECT_DEV}.supabase.co:5432/postgres"

# Branches to process
BRANCHES="main dev"

for BR in $BRANCHES; do
  echo "=========================================="
  echo "Running Migration 120 on branch: $BR"
  echo "=========================================="
  
  # Use Node.js runner with explicit connection URL
  if [ "$BR" = "main" ]; then
    DB_URL="$MAIN_DB_URL"
  else
    DB_URL="$DEV_DB_URL"
  fi
  echo "Using psql with direct database connection..."
  psql "$DB_URL" -f "$SQL_FILE"

  if [ $? -eq 0 ]; then
    echo "✅ Migration 120 completed successfully on $BR"
  else
    echo "❌ Migration 120 failed on $BR"
    exit 1
  fi
  echo ""
done

echo "🎉 Migration 120 applied to all branches!"
