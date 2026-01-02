#!/usr/bin/env node
/**
 * Generate Index Migration Script
 * 
 * Purpose: One-time migration tool for tenant UUID cleanup (Phase 2)
 * Context: Reads current schema and generates SQL to replace deprecated
 *          tenant_id_text/tenant_id_legacy indexes with tenant_id (UUID)
 * 
 * Input:  backend/migrations/dev_functions_export.sql (current schema)
 * Output: backend/migrations/110_replace_legacy_indexes.sql (migration)
 * 
 * When to use:
 * - Phase 2 of TENANT_ID_CLEANUP_PLAN.md
 * - After all tenant_id (UUID) columns are backfilled
 * - Before RLS policy migration (Phase 3)
 * 
 * How it works:
 * 1. Scans dev_functions_export.sql for CREATE INDEX statements
 * 2. Identifies indexes using tenant_id_text or tenant_id_legacy
 * 3. Generates DROP + CREATE CONCURRENTLY statements with tenant_id (UUID)
 * 4. Preserves WHERE clauses and composite index structures
 * 
 * Impact: ~100+ indexes across 40+ tables
 * Status: Tool ready, migration not yet applied
 * See: backend/migrations/MIGRATION_SCRIPTS_README.md for full context
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'migrations', 'dev_functions_export.sql');
const OUTPUT_FILE = path.join(__dirname, 'migrations', '110_replace_legacy_indexes.sql');

console.log('🔍 Parsing dev_functions_export.sql for legacy indexes...\n');

// Read the export file
const content = fs.readFileSync(INPUT_FILE, 'utf8');

// Extract all CREATE INDEX statements with tenant_id_text or tenant_id_legacy
const indexRegex = /CREATE\s+INDEX\s+"([^"]+)"\s+ON\s+"public"\."([^"]+)"\s+USING\s+"?(\w+)"?\s+\(([^)]+)\)(?:\s+WHERE\s+(.+?))?;/gi;

const legacyIndexes = [];
let match;

while ((match = indexRegex.exec(content)) !== null) {
  const [fullMatch, indexName, tableName, indexType, columns, whereClause] = match;
  
  // Check if this index uses tenant_id_text or tenant_id_legacy
  if (columns.includes('tenant_id_text') || columns.includes('tenant_id_legacy')) {
    legacyIndexes.push({
      name: indexName,
      table: tableName,
      type: indexType,
      columns: columns.trim(),
      where: whereClause ? whereClause.trim() : null,
      original: fullMatch
    });
  }
}

console.log(`✅ Found ${legacyIndexes.length} legacy indexes\n`);

// Generate migration SQL
let migrationSQL = `-- Migration 110: Replace Legacy Tenant ID Indexes
-- ==================================================================
-- Purpose: Replace tenant_id_text/tenant_id_legacy indexes with tenant_id (UUID)
-- Context: Phase 2 of legacy tenant ID cleanup plan
-- Impact: ~${legacyIndexes.length} indexes will be recreated
-- 
-- This migration:
-- 1. Drops old indexes using tenant_id_text or tenant_id_legacy
-- 2. Creates new indexes using tenant_id (UUID)
-- 3. Uses CREATE INDEX CONCURRENTLY to avoid table locks
-- 
-- Deployment: Apply during low-traffic window (recommended: 2am-5am UTC)
-- Rollback: See TENANT_ID_CLEANUP_PLAN.md Phase 2 rollback section

BEGIN;

-- Prevent other migrations from running concurrently
SET lock_timeout = '10s';

`;

// Group indexes by table for better organization
const indexesByTable = legacyIndexes.reduce((acc, idx) => {
  if (!acc[idx.table]) acc[idx.table] = [];
  acc[idx.table].push(idx);
  return acc;
}, {});

// Generate SQL for each table
for (const [tableName, indexes] of Object.entries(indexesByTable).sort()) {
  migrationSQL += `\n-- ====================================
-- ${tableName.toUpperCase()} (${indexes.length} indexes)
-- ====================================\n\n`;
  
  for (const idx of indexes) {
    // Generate new index name (replace _tenant with _tenant_uuid, etc.)
    const newIndexName = idx.name
      .replace('_tenant', '_tenant_uuid')
      .replace('tenant_id_text', 'tenant_id')
      .replace('tenant_id_legacy', 'tenant_id');
    
    // Replace column references
    const newColumns = idx.columns
      .replace(/["']?tenant_id_text["']?/g, '"tenant_id"')
      .replace(/["']?tenant_id_legacy["']?/g, '"tenant_id"');
    
    // Replace WHERE clause if present
    const newWhere = idx.where
      ? idx.where
          .replace(/["']?tenant_id_text["']?/g, '"tenant_id"')
          .replace(/["']?tenant_id_legacy["']?/g, '"tenant_id"')
      : null;
    
    // Drop old index
    migrationSQL += `-- Drop legacy index: ${idx.name}\n`;
    migrationSQL += `DROP INDEX IF EXISTS "${idx.name}";\n\n`;
    
    // Create new index (CONCURRENTLY requires it to be outside transaction)
    migrationSQL += `-- Create UUID-based index: ${newIndexName}\n`;
    migrationSQL += `-- Note: This will be created CONCURRENTLY in post-transaction step\n`;
    migrationSQL += `-- CREATE INDEX CONCURRENTLY "${newIndexName}" ON "public"."${idx.table}" USING ${idx.type} (${newColumns})`;
    
    if (newWhere) {
      migrationSQL += ` WHERE ${newWhere}`;
    }
    
    migrationSQL += `;\n\n`;
  }
}

migrationSQL += `
COMMIT;

-- ====================================
-- POST-TRANSACTION INDEX CREATION
-- ====================================
-- The following indexes must be created OUTSIDE the transaction
-- using CREATE INDEX CONCURRENTLY to avoid table locks.
-- 
-- Run these statements one at a time, monitoring for completion:

`;

// Generate CONCURRENTLY index creation statements
for (const [tableName, indexes] of Object.entries(indexesByTable).sort()) {
  migrationSQL += `\n-- ${tableName}\n`;
  
  for (const idx of indexes) {
    const newIndexName = idx.name
      .replace('_tenant', '_tenant_uuid')
      .replace('tenant_id_text', 'tenant_id')
      .replace('tenant_id_legacy', 'tenant_id');
    
    const newColumns = idx.columns
      .replace(/["']?tenant_id_text["']?/g, '"tenant_id"')
      .replace(/["']?tenant_id_legacy["']?/g, '"tenant_id"');
    
    const newWhere = idx.where
      ? idx.where
          .replace(/["']?tenant_id_text["']?/g, '"tenant_id"')
          .replace(/["']?tenant_id_legacy["']?/g, '"tenant_id"')
      : null;
    
    migrationSQL += `CREATE INDEX CONCURRENTLY IF NOT EXISTS "${newIndexName}" ON "public"."${idx.table}" USING ${idx.type} (${newColumns})`;
    
    if (newWhere) {
      migrationSQL += ` WHERE ${newWhere}`;
    }
    
    migrationSQL += `;\n`;
  }
}

migrationSQL += `
-- ====================================
-- VERIFICATION
-- ====================================
-- Run these queries to verify migration success:

-- 1. Check for remaining legacy indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexdef LIKE '%tenant_id_text%'
   OR indexdef LIKE '%tenant_id_legacy%'
ORDER BY tablename, indexname;
-- Expected: 0 rows

-- 2. Check for new UUID indexes
SELECT indexname, tablename
FROM pg_indexes
WHERE indexdef LIKE '%tenant_id%'
  AND indexdef NOT LIKE '%tenant_id_text%'
  AND indexdef NOT LIKE '%tenant_id_legacy%'
ORDER BY tablename, indexname;
-- Expected: ${legacyIndexes.length}+ rows

-- 3. Verify index usage (sample query)
EXPLAIN ANALYZE SELECT * FROM accounts WHERE tenant_id = '<uuid>';
-- Should use: Index Scan using idx_accounts_tenant_uuid

-- Migration complete! ✅
`;

// Write to output file
fs.writeFileSync(OUTPUT_FILE, migrationSQL);

console.log('📝 Generated migration summary:\n');
console.log(`   Tables affected: ${Object.keys(indexesByTable).length}`);
console.log(`   Indexes to replace: ${legacyIndexes.length}`);
console.log(`   Output file: ${OUTPUT_FILE}\n`);

// Print summary by table
console.log('📊 Breakdown by table:\n');
for (const [tableName, indexes] of Object.entries(indexesByTable).sort()) {
  console.log(`   ${tableName.padEnd(30)} ${indexes.length} indexes`);
}

console.log(`\n✅ Migration file generated successfully!`);
console.log(`\n📋 Next steps:`);
console.log(`   1. Review ${OUTPUT_FILE}`);
console.log(`   2. Test in local environment`);
console.log(`   3. Deploy to staging`);
console.log(`   4. Monitor performance`);
console.log(`   5. Deploy to production (low-traffic window)`);
