#!/usr/bin/env node
/**
 * Cleanup E2E Test Users
 * 
 * Removes any test users created during E2E runs that weren't properly cleaned up.
 * Safe to run manually or as part of maintenance tasks.
 * 
 * Targets users with:
 * - email patterns: audit.test.*, e2e.temp.*, *@playwright.test
 * - tenant_id: e2e-test-tenant-* or test-tenant (legacy)
 * - metadata.is_e2e_test_data === true
 * 
 * Usage:
 *   node backend/scripts/cleanup-e2e-users.js
 *   node backend/scripts/cleanup-e2e-users.js --dry-run  # Preview only
 */

import dotenv from 'dotenv';
import { pool as supabasePool, initSupabaseDB } from '../lib/supabase-db.js';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const dryRun = process.argv.includes('--dry-run');

async function cleanupE2EUsers() {
  console.log('🧹 E2E Test User Cleanup');
  console.log('========================\n');
  
  if (dryRun) {
    console.log('⚠️  DRY RUN MODE - No changes will be made\n');
  }

  // Initialize Supabase connection
  if (process.env.USE_SUPABASE_PROD !== 'true') {
    console.error('❌ Error: USE_SUPABASE_PROD must be set to "true"');
    console.error('   This script requires Supabase database access.');
    process.exit(1);
  }

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    process.exit(1);
  }

  initSupabaseDB(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Query for E2E test users based on multiple criteria
    const query = `
      SELECT id, email, first_name, last_name, role, tenant_id, created_at, metadata
      FROM users
      WHERE 
        -- Email patterns used by E2E tests
        email LIKE 'audit.test.%@example.com' OR
        email LIKE 'e2e.temp.%@playwright.test' OR
        email LIKE '%@playwright.test' OR
        -- Dedicated E2E test tenants
        tenant_id LIKE 'e2e-test-tenant-%' OR
        tenant_id = 'test-tenant' OR
        -- Metadata flag
        (metadata->>'is_e2e_test_data')::boolean = true
      ORDER BY created_at DESC
    `;

    const result = await supabasePool.query(query);
    const testUsers = result.rows;

    if (testUsers.length === 0) {
      console.log('✅ No E2E test users found. Database is clean!');
      process.exit(0);
    }

    console.log(`Found ${testUsers.length} E2E test user(s):\n`);
    
    testUsers.forEach((user, index) => {
      console.log(`${index + 1}. ${user.email}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.first_name} ${user.last_name}`);
      console.log(`   Role: ${user.role}`);
      console.log(`   Tenant: ${user.tenant_id || '(global)'}`);
      console.log(`   Created: ${user.created_at}`);
      console.log('');
    });

    if (dryRun) {
      console.log('⚠️  DRY RUN: Would delete these users. Run without --dry-run to execute.');
      process.exit(0);
    }

    // Prompt for confirmation if not in automated mode
    const isAutomated = process.env.CI === 'true' || process.argv.includes('--yes');
    if (!isAutomated) {
      console.log('⚠️  WARNING: This will permanently delete these users.');
      console.log('   Press Ctrl+C to cancel, or wait 5 seconds to continue...\n');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // Delete users
    let deletedCount = 0;
    let failedCount = 0;

    for (const user of testUsers) {
      try {
        await supabasePool.query('DELETE FROM users WHERE id = $1', [user.id]);
        console.log(`✅ Deleted: ${user.email} (${user.id})`);
        deletedCount++;
      } catch (error) {
        console.error(`❌ Failed to delete ${user.email}: ${error.message}`);
        failedCount++;
      }
    }

    console.log('\n========================');
    console.log(`✅ Deleted: ${deletedCount} user(s)`);
    if (failedCount > 0) {
      console.log(`❌ Failed: ${failedCount} user(s)`);
    }
    console.log('🧹 Cleanup complete!');

  } catch (error) {
    console.error('❌ Cleanup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run cleanup
cleanupE2EUsers()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
