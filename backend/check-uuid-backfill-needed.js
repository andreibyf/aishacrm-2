#!/usr/bin/env node
/**
 * Check if Utility Tables Need Tenant UUID Backfill
 * 
 * STATUS: ✅ HISTORICAL - Migration 105 already applied
 * Purpose: Pre-migration 105 validation script
 * Context: Verified which rows needed tenant_id (UUID) backfill
 * 
 * This script:
 * - Checks notifications, system_logs, modulesettings tables
 * - Counts rows with NULL tenant_id but non-NULL tenant_id_text
 * - Historical reference for understanding migration 105 scope
 * 
 * Run with Doppler: doppler run -- node backend/check-uuid-backfill-needed.js
 * See: backend/migrations/105_backfill_utility_tables_tenant_uuid.sql
 * See: backend/migrations/MIGRATION_SCRIPTS_README.md for full context
 */

import { initSupabaseDB, getSupabaseClient } from './lib/supabase-db.js';

async function checkTable(supabase, tableName) {
  console.log(`\n📊 Checking ${tableName}...`);
  
  // Count rows with NULL tenant_id (UUID)
  const { count: nullCount, error: nullError } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })
    .is('tenant_id', null);
  
  if (nullError) {
    console.error(`  ❌ Error checking NULL tenant_id:`, nullError.message);
    return;
  }
  
  // Count rows with non-NULL tenant_id_text
  const { count: textCount, error: textError } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })
    .not('tenant_id_text', 'is', null);
  
  if (textError) {
    console.error(`  ❌ Error checking tenant_id_text:`, textError.message);
    return;
  }
  
  // Count rows needing backfill (NULL UUID but has TEXT)
  const { count: needsBackfill, error: backfillError } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true })
    .is('tenant_id', null)
    .not('tenant_id_text', 'is', null);
  
  if (backfillError) {
    console.error(`  ❌ Error checking backfill needed:`, backfillError.message);
    return;
  }
  
  // Total rows
  const { count: totalCount, error: totalError } = await supabase
    .from(tableName)
    .select('id', { count: 'exact', head: true });
  
  if (totalError) {
    console.error(`  ❌ Error checking total:`, totalError.message);
    return;
  }
  
  console.log(`  Total rows: ${totalCount}`);
  console.log(`  Rows with NULL tenant_id (UUID): ${nullCount}`);
  console.log(`  Rows with tenant_id_text: ${textCount}`);
  console.log(`  🎯 Rows needing backfill: ${needsBackfill}`);
  
  if (needsBackfill > 0) {
    console.log(`  ⚠️  Migration 105 will backfill ${needsBackfill} rows`);
    
    // Sample some rows to verify
    const { data: samples, error: sampleError } = await supabase
      .from(tableName)
      .select('id, tenant_id, tenant_id_text')
      .is('tenant_id', null)
      .not('tenant_id_text', 'is', null)
      .limit(3);
    
    if (!sampleError && samples?.length > 0) {
      console.log(`  Sample rows needing backfill:`);
      samples.forEach(row => {
        console.log(`    - ID: ${row.id}, tenant_id: NULL, tenant_id_text: ${row.tenant_id_text}`);
      });
    }
  } else if (nullCount === 0) {
    console.log(`  ✅ All rows already have UUID tenant_id - no backfill needed`);
  } else {
    console.log(`  ⚠️  ${nullCount} rows have NULL tenant_id but also NULL tenant_id_text (orphaned?)`);
  }
  
  return { tableName, totalCount, nullCount, textCount, needsBackfill };
}

async function main() {
  await initSupabaseDB();
  const supabase = getSupabaseClient();
  
  console.log('🔍 Checking if tenant_id UUID backfill is needed...\n');
  console.log('Tables to check:');
  console.log('  - notifications');
  console.log('  - system_logs');
  console.log('  - modulesettings');
  
  const tables = ['notifications', 'system_logs', 'modulesettings'];
  const results = [];
  
  for (const table of tables) {
    try {
      const result = await checkTable(supabase, table);
      if (result) results.push(result);
    } catch (error) {
      console.error(`\n❌ Fatal error checking ${table}:`, error);
    }
  }
  
  console.log('\n' + '='.repeat(60));
  console.log('📋 SUMMARY');
  console.log('='.repeat(60));
  
  let totalNeedsBackfill = 0;
  results.forEach(r => {
    console.log(`${r.tableName.padEnd(20)} → ${r.needsBackfill} rows need backfill`);
    totalNeedsBackfill += r.needsBackfill;
  });
  
  console.log('='.repeat(60));
  console.log(`Total rows needing backfill: ${totalNeedsBackfill}`);
  
  if (totalNeedsBackfill > 0) {
    console.log('\n✅ Migration 105 is REQUIRED - proceed with deployment');
  } else {
    console.log('\n⚠️  No backfill needed - migration will be a no-op');
  }
  
  console.log('\n💡 After migration runs, verify with:');
  console.log('   SELECT COUNT(*) FROM notifications WHERE tenant_id IS NULL;');
  console.log('   (Should return 0)');
}

main().catch(error => {
  console.error('\n💥 Fatal error:', error);
  process.exit(1);
});
