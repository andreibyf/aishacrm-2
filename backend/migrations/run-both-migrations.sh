#!/bin/bash
# Run both Migration 120 and 121 in sequence on dev and main branches
# Must run 120 first (fixes views/RLS) then 121 (hardens functions)

export SB_PROJECT=ehjlenywplgyiahgxkfj
export SB_PROJECT_DEV=efzqxjpfewkrgpdootte

echo "=========================================="
echo "Running Migrations 120 + 121 on dev and main"
echo "=========================================="
echo ""

# Run Migration 120 first
./run-120.sh
if [ $? -ne 0 ]; then
  echo "❌ Migration 120 failed. Stopping."
  exit 1
fi

echo ""
echo "Migration 120 complete. Now running 121..."
echo ""

# Run Migration 121 second
./run-121.sh
if [ $? -ne 0 ]; then
  echo "❌ Migration 121 failed. Stopping."
  exit 1
fi

echo ""
echo "=========================================="
echo "🎉 Both migrations completed successfully!"
echo "=========================================="
echo ""
echo "Final verification:"
echo "1. Go to Database → Linter in Supabase Dashboard"
echo "2. Confirm 0 security warnings"
echo "3. Run: git add backend/migrations/120_fix_remaining_security_issues.sql backend/migrations/121_supabase_ai_security_fixes.sql"
echo "4. Run: git commit -m 'feat: Fix migration 120 schema errors and harden 40 custom functions'"
echo "5. Run: git push"
