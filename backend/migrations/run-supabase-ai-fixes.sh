#!/bin/bash
# Script: Run Supabase AI Security Fixes
# Purpose: Guide user through applying Supabase AI-generated security fixes

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  Supabase AI Security Fix Helper                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Step 1: Check if migration file exists
# Handle both running from repo root and from backend/migrations directory
if [ -f "121_supabase_ai_security_fixes.sql" ]; then
    MIGRATION_FILE="121_supabase_ai_security_fixes.sql"
elif [ -f "backend/migrations/121_supabase_ai_security_fixes.sql" ]; then
    MIGRATION_FILE="backend/migrations/121_supabase_ai_security_fixes.sql"
else
    echo "❌ Migration file not found"
    echo "   Searched: ./121_supabase_ai_security_fixes.sql"
    echo "   Searched: backend/migrations/121_supabase_ai_security_fixes.sql"
    exit 1
fi

echo "✅ Migration file found: $MIGRATION_FILE"
echo ""

# Step 2: Instructions for Supabase AI
echo "📋 STEP 1: Run Supabase AI Fix"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to Supabase Dashboard → Database → Linter"
echo "2. Click on each security warning"
echo "3. Click 'Fix with AI' button"
echo "4. Use the following templates:"
echo ""
echo "   For regular functions (SECURITY INVOKER):"
echo "   ────────────────────────────────────────────────────────────"
echo "   Rewrite this Postgres function to set a fixed search_path"
echo "   and schema-qualify all references. Use SET search_path ="
echo "   public, pg_catalog and keep language and return type unchanged."
echo ""
echo "   For SECURITY DEFINER functions (if needed):"
echo "   ────────────────────────────────────────────────────────────"
echo "   Convert this function to SECURITY DEFINER, set a safe"
echo "   search_path, schema-qualify all objects, and remove any"
echo "   dependency on current_user or session GUCs. Also propose"
echo "   GRANT/REVOKE statements."
echo ""
echo "5. Copy the generated SQL for each function"
echo ""
read -p "Press Enter when you've copied all generated SQL..."
echo ""

# Step 3: Edit migration file
echo "📝 STEP 2: Edit Migration File"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Opening migration file in editor..."
echo ""
echo "Paste the Supabase AI-generated SQL into the appropriate sections:"
echo "  - PART 1: Regular functions (SECURITY INVOKER)"
echo "  - PART 2: SECURITY DEFINER functions (if any)"
echo ""

# Open in default editor
if command -v code &> /dev/null; then
    code "$MIGRATION_FILE"
elif command -v nano &> /dev/null; then
    nano "$MIGRATION_FILE"
else
    echo "No editor found. Please manually edit: $MIGRATION_FILE"
fi

echo ""
read -p "Press Enter when you've finished editing the migration file..."
echo ""

# Step 4: Show migration file content
echo "📄 STEP 3: Review Migration File"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Migration file preview (first 50 lines):"
echo "────────────────────────────────────────────────────────────"
head -50 "$MIGRATION_FILE"
echo "────────────────────────────────────────────────────────────"
echo ""
read -p "Does the migration look correct? (y/n): " confirm

if [ "$confirm" != "y" ]; then
    echo "❌ Aborted. Please review and edit the migration file."
    exit 1
fi

echo ""

# Step 5: Apply migration
echo "🚀 STEP 4: Apply Migration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Choose how to apply the migration:"
echo ""
echo "Option A: Supabase Dashboard (Recommended)"
echo "  1. Go to Supabase Dashboard → SQL Editor"
echo "  2. Copy contents of: $MIGRATION_FILE"
echo "  3. Paste and run"
echo "  4. Verify no errors"
echo ""
echo "Option B: Supabase CLI (if installed)"
echo "  Run: supabase db push $MIGRATION_FILE"
echo ""
read -p "Press Enter when migration has been applied successfully..."
echo ""

# Step 6: Verification
echo "✅ STEP 5: Verify Fixes"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to Supabase Dashboard → Database → Linter"
echo "2. Verify security warning count = 0"
echo "3. Run verification queries from migration file (bottom)"
echo ""
read -p "Do all verifications pass? (y/n): " verify

if [ "$verify" != "y" ]; then
    echo "⚠️  Verification failed. Check linter output and migration logs."
    exit 1
fi

echo ""

# Step 7: Commit to git
echo "💾 STEP 6: Commit to Git"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
read -p "Commit migration file to git? (y/n): " commit

if [ "$commit" = "y" ]; then
    git add "$MIGRATION_FILE"
    git commit -m "feat: Apply Supabase AI security fixes (migration 121)

- Hardened functions with SET search_path = public, pg_catalog
- Schema-qualified all object references
- Applied SECURITY DEFINER hardening where needed
- Added GRANT/REVOKE statements for function permissions
- Verified all security linter warnings resolved"
    
    echo "✅ Committed to git"
    echo ""
    read -p "Push to GitHub? (y/n): " push
    
    if [ "$push" = "y" ]; then
        git push
        echo "✅ Pushed to GitHub"
    fi
else
    echo "⚠️  Migration not committed. Remember to commit manually!"
fi

echo ""
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  ✅ Supabase AI Security Fixes Complete!                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""
echo "Summary:"
echo "  - Migration 121 created and applied"
echo "  - Security linter warnings resolved"
echo "  - Functions hardened with safe search_path"
echo "  - Changes committed to git"
echo ""
echo "Next: Monitor application for any function call errors"
echo ""
