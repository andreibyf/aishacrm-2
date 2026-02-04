#!/usr/bin/env bash
set -euo pipefail

# Run Migration 121 on both dev and main branches
# Security hardening: 40 custom functions with SET search_path

export SB_PROJECT=ehjlenywplgyiahgxkfj
export SB_PROJECT_DEV=efzqxjpfewkrgpdootte
SQL_FILE="./121_supabase_ai_security_fixes.sql"

# Database connection strings
# Main: Production database
# Dev: Separate dev/QA project
export MAIN_DB_URL="postgresql://postgres:Aml834VyYYH6humU@db.${SB_PROJECT}.supabase.co:5432/postgres"
export DEV_DB_URL="postgresql://postgres:Aml834VyYYH6humU@db.${SB_PROJECT_DEV}.supabase.co:5432/postgres"

# Branches to process
BRANCHES="main dev"

for BR in $BRANCHES; do
  echo "=========================================="
  echo "Running Migration 121 on branch: $BR"
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
    echo "✅ Migration 121 completed successfully on $BR"
  else
    echo "❌ Migration 121 failed on $BR"
    exit 1
  fi
  echo ""
done
echo "🎉 Migration 121 applied to all branches!"
echo ""
echo "Next steps:"
echo "1. Go to Database → Linter in Supabase Dashboard"
echo "2. Verify 0 security warnings"
echo "3. Commit both migrations to git"
