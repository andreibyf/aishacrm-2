import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const INPUT_FILE = path.join(__dirname, 'migrations', 'dev_functions_export.sql');
const OUTPUT_FILE = path.join(__dirname, 'migrations', '112_drop_legacy_tenant_columns.sql');

const content = fs.readFileSync(INPUT_FILE, 'utf8');

// Find all tables with tenant_id_text or tenant_id_legacy
// Pattern: CREATE TABLE [IF NOT EXISTS] "public"."tableName" ( ... "tenant_id_text" ... );
const tableRegex = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?"public"\."([^"]+)"\s+\((.+?)\);/gs;

const tablesToCleanup = [];
let match;

while ((match = tableRegex.exec(content)) !== null) {
  const [fullMatch, tableName, columnsPart] = match;
  
  const columns = [];
  if (columnsPart.includes('"tenant_id_text"')) columns.push('tenant_id_text');
  if (columnsPart.includes('"tenant_id_legacy"')) columns.push('tenant_id_legacy');
  
  if (columns.length > 0) {
    tablesToCleanup.push({
      name: tableName,
      columns: columns
    });
  }
}

console.log(`Found ${tablesToCleanup.length} tables to cleanup.`);

let sql = `-- Migration 112: Drop Legacy Tenant ID Columns
-- ==================================================================
-- Purpose: Final cleanup of deprecated tenant_id_text and tenant_id_legacy
-- Context: Phase 4 (FINAL) of legacy tenant ID cleanup plan
-- Impact: Reclaims disk space, simplifies schema, prevents legacy usage
-- 
-- PREREQUISITES:
-- 1. Phase 2 (Indexes) complete and verified
-- 2. Phase 3 (RLS Policies) complete and verified
-- 3. Application code verified to have ZERO references to these columns
-- 
-- Deployment: Apply during low-traffic window
-- Rollback: Requires restoring from backup or re-adding columns and backfilling

BEGIN;

-- Prevent other migrations from running concurrently
SET lock_timeout = '30s';

`;

for (const table of tablesToCleanup.sort((a, b) => a.name.localeCompare(b.name))) {
  sql += `-- Table: ${table.name}\n`;
  for (const col of table.columns) {
    sql += `ALTER TABLE "public"."${table.name}" DROP COLUMN IF EXISTS "${col}";\n`;
  }
  sql += `\n`;
}

sql += `
COMMIT;

-- ====================================
-- VERIFICATION
-- ====================================
-- 1. Check for any remaining legacy columns
SELECT table_name, column_name
FROM information_schema.columns
WHERE column_name IN ('tenant_id_text', 'tenant_id_legacy')
  AND table_schema = 'public';
-- Expected: 0 rows

-- 2. Verify application still works
-- Run health checks and core entity list/get APIs

-- Migration complete! ✅
`;

fs.writeFileSync(OUTPUT_FILE, sql);
console.log(`Generated ${OUTPUT_FILE}`);
