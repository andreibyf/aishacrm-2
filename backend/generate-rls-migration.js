#!/usr/bin/env node
/**
 * Generate RLS Policy Migration Script
 * 
 * Reads dev_functions_export.sql and generates migration to replace
 * all tenant_id_text/tenant_id_legacy RLS policies with tenant_id (UUID) policies
 * 
 * Output: backend/migrations/111_replace_legacy_rls_policies.sql
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'migrations', 'dev_functions_export.sql');
const OUTPUT_FILE = path.join(__dirname, 'migrations', '111_replace_legacy_rls_policies.sql');

console.log('🔍 Parsing dev_functions_export.sql for legacy RLS policies...\n');

// Read the export file
const content = fs.readFileSync(INPUT_FILE, 'utf8');

// Extract all CREATE POLICY statements with tenant_id_text or tenant_id_legacy
const policyRegex = /CREATE\s+POLICY\s+"([^"]+)"\s+ON\s+"public"\."([^"]+)"(?:\s+(?:FOR\s+(\w+))?\s+(?:TO\s+(\w+))?)?\s+USING\s+\((.+?)\);/gis;

const legacyPolicies = [];
let match;

while ((match = policyRegex.exec(content)) !== null) {
  const [fullMatch, policyName, tableName, forClause, toClause, usingClause] = match;
  
  // Check if this policy uses tenant_id_text or tenant_id_legacy
  if (usingClause.includes('tenant_id_text') || usingClause.includes('tenant_id_legacy')) {
    legacyPolicies.push({
      name: policyName,
      table: tableName,
      for: forClause || null,
      to: toClause || null,
      using: usingClause.trim(),
      original: fullMatch
    });
  }
}

console.log(`✅ Found ${legacyPolicies.length} legacy RLS policies\n`);

// Generate migration SQL
let migrationSQL = `-- Migration 111: Replace Legacy Tenant ID RLS Policies
-- ==================================================================
-- Purpose: Replace tenant_id_text/tenant_id_legacy RLS policies with tenant_id (UUID)
-- Context: Phase 3 of legacy tenant ID cleanup plan
-- Impact: ${legacyPolicies.length} RLS policies will be recreated
-- Security: CRITICAL - ensures tenant isolation uses correct UUID column
-- 
-- This migration:
-- 1. Drops old RLS policies using tenant_id_text or tenant_id_legacy
-- 2. Creates new RLS policies using tenant_id (UUID)
-- 3. Preserves superadmin bypass logic
-- 4. Ensures proper tenant isolation
-- 
-- Deployment: Apply during low-traffic window (recommended: 2am-5am UTC)
-- Rollback: See TENANT_ID_CLEANUP_PLAN.md Phase 3 rollback section

BEGIN;

-- Prevent other migrations from running concurrently
SET lock_timeout = '10s';

`;

// Group policies by table
const policiesByTable = legacyPolicies.reduce((acc, policy) => {
  if (!acc[policy.table]) acc[policy.table] = [];
  acc[policy.table].push(policy);
  return acc;
}, {});

// Generate SQL for each table
for (const [tableName, policies] of Object.entries(policiesByTable).sort()) {
  migrationSQL += `\n-- ====================================
-- ${tableName.toUpperCase()} (${policies.length} ${policies.length === 1 ? 'policy' : 'policies'})
-- ====================================\n\n`;
  
  for (const policy of policies) {
    // Generate new policy name
    const newPolicyName = policy.name
      .replace('_tenant_', '_tenant_uuid_')
      .replace(/_text$/, '_uuid')
      .replace(/_legacy$/, '_uuid');
    
    // Drop old policy
    migrationSQL += `-- Drop legacy policy: ${policy.name}\n`;
    migrationSQL += `DROP POLICY IF EXISTS "${policy.name}" ON "public"."${policy.table}";\n\n`;
    
    // Generate new USING clause with tenant_id (UUID)
    // Pattern: tenant_id_text = current_setting(...) → tenant_id IN (SELECT tenant_uuid FROM users WHERE id = auth.uid())
    let newUsingClause;
    
    if (policy.using.includes('current_setting')) {
      // Standard pattern: tenant_id_text = current_setting('app.current_tenant_id')
      newUsingClause = `("tenant_id" IN (SELECT "tenant_uuid" FROM "users" WHERE "id" = auth.uid()))`;
      
      // Check for bypass logic
      if (policy.using.includes('bypass_rls')) {
        newUsingClause = `(${newUsingClause} OR (current_setting('app.bypass_rls', true) = 'true'))`;
      }
    } else {
      // Fallback: simple replace
      newUsingClause = policy.using
        .replace(/["']?tenant_id_text["']?/g, '"tenant_id"')
        .replace(/["']?tenant_id_legacy["']?/g, '"tenant_id"');
    }
    
    // Create new policy
    migrationSQL += `-- Create UUID-based policy: ${newPolicyName}\n`;
    migrationSQL += `CREATE POLICY "${newPolicyName}" ON "public"."${tableName}"`;
    
    if (policy.for) {
      migrationSQL += `\n  FOR ${policy.for}`;
    }
    
    if (policy.to) {
      migrationSQL += `\n  TO ${policy.to}`;
    }
    
    migrationSQL += `\n  USING ${newUsingClause};\n\n`;
  }
}

migrationSQL += `
COMMIT;

-- ====================================
-- VERIFICATION
-- ====================================
-- Run these queries to verify migration success:

-- 1. Check for remaining legacy RLS policies
SELECT tablename, policyname, definition
FROM pg_policies
WHERE definition LIKE '%tenant_id_text%'
   OR definition LIKE '%tenant_id_legacy%'
ORDER BY tablename, policyname;
-- Expected: 0 rows

-- 2. Check for new UUID RLS policies
SELECT tablename, policyname, definition
FROM pg_policies
WHERE definition LIKE '%tenant_id%'
  AND definition NOT LIKE '%tenant_id_text%'
  AND definition NOT LIKE '%tenant_id_legacy%'
ORDER BY tablename, policyname;
-- Expected: ${legacyPolicies.length}+ rows

-- 3. Test RLS enforcement (as authenticated user)
-- Run as regular user:
SET ROLE authenticated;
SET request.jwt.claims.sub = '<user-uuid>';
SELECT COUNT(*) FROM accounts; -- Should only see own tenant
RESET ROLE;

-- 4. Test superadmin bypass (if applicable)
-- Run as superadmin:
SET ROLE authenticated;
SET request.jwt.claims.sub = '<superadmin-uuid>';
SELECT COUNT(*) FROM accounts; -- Should see all tenants
RESET ROLE;

-- Migration complete! ✅
`;

// Write to output file
fs.writeFileSync(OUTPUT_FILE, migrationSQL);

console.log('📝 Generated migration summary:\n');
console.log(`   Tables affected: ${Object.keys(policiesByTable).length}`);
console.log(`   Policies to replace: ${legacyPolicies.length}`);
console.log(`   Output file: ${OUTPUT_FILE}\n`);

// Print summary by table
console.log('📊 Breakdown by table:\n');
for (const [tableName, policies] of Object.entries(policiesByTable).sort()) {
  console.log(`   ${tableName.padEnd(30)} ${policies.length} ${policies.length === 1 ? 'policy' : 'policies'}`);
}

console.log(`\n✅ Migration file generated successfully!`);
console.log(`\n⚠️  SECURITY CRITICAL:\n`);
console.log(`   These RLS policies enforce tenant isolation.`);
console.log(`   Test thoroughly in staging before production deployment.\n`);
console.log(`📋 Next steps:`);
console.log(`   1. Review ${OUTPUT_FILE}`);
console.log(`   2. Test RLS enforcement in local environment`);
console.log(`   3. Deploy to staging`);
console.log(`   4. Run security tests (user isolation, superadmin access)`);
console.log(`   5. Deploy to production (low-traffic window)`);
console.log(`   6. Monitor auth logs for 24 hours`);
