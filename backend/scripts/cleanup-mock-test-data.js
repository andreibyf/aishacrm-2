#!/usr/bin/env node
/**
 * Clean up mock/test data from production Supabase database
 * 
 * This script identifies and removes records created by:
 * - Mock dev user (dev@localhost, local-dev-user-001)
 * - Test email patterns (test@*, *@test.com, *+test@*)
 * - Local tenant references (6cb4c008-4847-426a-9a2e-918ad70e7b69)
 * 
 * Usage:
 *   # Dry run (show what would be deleted):
 *   node backend/scripts/cleanup-mock-test-data.js
 * 
 *   # Actually delete the records:
 *   node backend/scripts/cleanup-mock-test-data.js --execute
 * 
 * IMPORTANT: Review the dry-run output before using --execute!
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const EXECUTE_MODE = process.argv.includes('--execute');

// Mock/test patterns to identify
const MOCK_USER_IDS = ['local-dev-user-001'];
const MOCK_TENANT_IDS = ['a11dfb63-4b18-4eb8-872e-747af2e37c46'];
const TEST_EMAIL_PATTERNS = [
  'dev@localhost',
  '%test@%',
  '%@test.com',
  '%+test@%',
  'mock@%',
  'fake@%',
  'demo@localhost%'
];

// Tables to clean (in dependency order - children first, parents last)
const TABLES_TO_CLEAN = [
  // Activity/audit tables
  'activities',
  'audit_logs',
  'system_logs',
  
  // Relationship tables
  'contact_accounts',
  'opportunity_contacts',
  
  // Business entities
  'ai_campaigns',
  'opportunities',
  'leads',
  'contacts',
  'accounts',
  'bizdev_sources',
  'cash_flow',
  'documents',
  
  // User/employee related
  'employees',
  'users',
  
  // Configuration
  'module_settings',
  'notifications',
  
  // Tenant (last - referenced by most tables)
  'tenants'
];

async function findTestRecords(table) {
  const results = { byUser: [], byTenant: [], byEmail: [] };
  
  try {
    // Check for mock user IDs
    if (['activities', 'audit_logs', 'opportunities', 'leads', 'contacts', 'accounts', 'employees'].includes(table)) {
      const { data: userRecords } = await supabase
        .from(table)
        .select('id, email, created_by, updated_by')
        .or(MOCK_USER_IDS.map(id => `created_by.eq.${id},updated_by.eq.${id}`).join(','))
        .limit(100);
      
      if (userRecords?.length) {
        results.byUser = userRecords;
      }
    }
    
    // Check for mock tenant IDs
    if (table !== 'tenants') {
      const { data: tenantRecords } = await supabase
        .from(table)
        .select('id, tenant_id')
        .in('tenant_id', MOCK_TENANT_IDS)
        .limit(100);
      
      if (tenantRecords?.length) {
        results.byTenant = tenantRecords;
      }
    }
    
    // Check for test email patterns (users, employees, contacts, leads)
    if (['users', 'employees', 'contacts', 'leads'].includes(table)) {
      for (const pattern of TEST_EMAIL_PATTERNS) {
        const { data: emailRecords } = await supabase
          .from(table)
          .select('id, email')
          .like('email', pattern)
          .limit(100);
        
        if (emailRecords?.length) {
          results.byEmail.push(...emailRecords);
        }
      }
    }
    
    // Special case: check tenant table for mock tenant
    if (table === 'tenant') {
      const { data: mockTenants } = await supabase
        .from('tenant')
        .select('id, name, slug')
        .in('id', MOCK_TENANT_IDS)
        .limit(10);
      
      if (mockTenants?.length) {
        results.byTenant = mockTenants;
      }
    }
    
  } catch (error) {
    console.warn(`  ⚠️  Error scanning ${table}:`, error.message);
  }
  
  return results;
}

async function deleteRecords(table, ids) {
  if (!EXECUTE_MODE) {
    return { success: true, count: ids.length };
  }
  
  try {
    const { error, count } = await supabase
      .from(table)
      .delete()
      .in('id', ids);
    
    if (error) {
      throw error;
    }
    
    return { success: true, count: count || ids.length };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('🔍 Scanning Supabase database for mock/test data...\n');
  
  if (EXECUTE_MODE) {
    console.log('⚠️  EXECUTE MODE ENABLED - Records will be PERMANENTLY DELETED!\n');
  } else {
    console.log('ℹ️  DRY RUN MODE - No records will be deleted (use --execute to delete)\n');
  }
  
  const summary = {
    tablesWithData: 0,
    totalRecords: 0,
    deletedRecords: 0,
    errors: []
  };
  
  for (const table of TABLES_TO_CLEAN) {
    process.stdout.write(`Scanning ${table}... `);
    
    const results = await findTestRecords(table);
    const allIds = [
      ...results.byUser.map(r => r.id),
      ...results.byTenant.map(r => r.id),
      ...results.byEmail.map(r => r.id)
    ];
    
    // Deduplicate IDs
    const uniqueIds = [...new Set(allIds)];
    
    if (uniqueIds.length === 0) {
      console.log('✓ Clean');
      continue;
    }
    
    summary.tablesWithData++;
    summary.totalRecords += uniqueIds.length;
    
    console.log(`\n  Found ${uniqueIds.length} test record(s):`);
    
    // Show sample records
    const samples = [...results.byUser, ...results.byTenant, ...results.byEmail].slice(0, 5);
    samples.forEach(record => {
      const display = record.email || record.name || record.slug || record.id;
      console.log(`    - ${display}`);
    });
    
    if (uniqueIds.length > 5) {
      console.log(`    ... and ${uniqueIds.length - 5} more`);
    }
    
    // Delete if in execute mode
    if (EXECUTE_MODE) {
      const result = await deleteRecords(table, uniqueIds);
      if (result.success) {
        console.log(`  ✓ Deleted ${result.count} record(s)`);
        summary.deletedRecords += result.count;
      } else {
        console.log(`  ✗ Delete failed: ${result.error}`);
        summary.errors.push({ table, error: result.error });
      }
    }
    
    console.log('');
  }
  
  // Final summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));
  console.log(`Tables with test data: ${summary.tablesWithData}`);
  console.log(`Total test records found: ${summary.totalRecords}`);
  
  if (EXECUTE_MODE) {
    console.log(`Records deleted: ${summary.deletedRecords}`);
    if (summary.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered:`);
      summary.errors.forEach(({ table, error }) => {
        console.log(`  - ${table}: ${error}`);
      });
    } else {
      console.log('\n✓ All test data cleaned successfully!');
    }
  } else {
    console.log('\nℹ️  Run with --execute flag to delete these records.');
  }
  
  console.log('');
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
