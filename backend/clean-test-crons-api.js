#!/usr/bin/env node

/**
 * Clean Test Cron Jobs via API
 * 
 * This script uses the backend API to safely remove test/development cron jobs
 * while preserving production jobs like the C.A.R.E. Customer Adaptive Response Engine.
 * 
 * Usage: node backend/clean-test-crons-api.js
 */

const testCronIds = [
  'ba7754f7-e835-4dc3-8894-756af406217e', // New Test Cron (new_test_function, inactive)
  '46774a29-db46-4b6a-b23e-ce55879ae26e', // Updated Test Cron (test_function, 51 executions)
  '68a566fe-c846-47fc-93ea-bdf7a9b66038', // New Test Cron (new_test_function, inactive)
  'b34b687b-f873-4047-a989-f8f4bf513968', // Test Cron Job (test_function, inactive)
  '34e1b456-402f-499e-ad64-2ce0dbf8b9e1', // New Test Cron (new_test_function, inactive)
  'cfbd7800-4cb5-4e36-b1a4-fdabb59e7209'  // Updated Test Cron (test_function, 51 executions)
];

const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const baseUrl = 'http://localhost:4001';

// Environment detection - allow override for dev database targeting
const forceDevCleanup = process.env.TARGET_DEV_DB === 'true' || process.argv.includes('--dev');
const isDev = process.env.NODE_ENV === 'development' || 
             process.env.DOPPLER_ENVIRONMENT === 'dev' ||
             process.env.DATABASE_URL?.includes('localhost') ||
             process.env.SUPABASE_URL?.includes('localhost') ||
             forceDevCleanup;

const environment = isDev ? '🟡 DEV' : '🔴 PROD';

if (forceDevCleanup) {
  console.log('🎯 Targeting DEV database for test cron cleanup (override active)');
}

async function deleteCronJob(cronId) {
  try {
    const response = await fetch(`${baseUrl}/api/cron/jobs/${cronId}?tenant_id=${tenantId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log(`✅ Deleted cron job: ${cronId}`);
      return { success: true, id: cronId };
    } else {
      console.error(`❌ Failed to delete ${cronId}:`, result.message || result.error);
      return { success: false, id: cronId, error: result.message || result.error };
    }
  } catch (error) {
    console.error(`❌ Error deleting ${cronId}:`, error.message);
    return { success: false, id: cronId, error: error.message };
  }
}

async function cleanTestCronsViaApi() {
  console.log('🧪 Cleaning up test cron jobs via API...\n');
  console.log(`🌍 Environment: ${environment}`);
  console.log(`📋 Target cron jobs to delete: ${testCronIds.length}`);
  console.log(`🎯 Tenant: ${tenantId}\n`);
  
  // Safety check for production
  if (!isDev && !forceDevCleanup) {
    console.log('⚠️  WARNING: This appears to be a PRODUCTION environment!');
    console.log('🛡️  Production cleanup is disabled by default for safety.');
    console.log('\n💡 To clean test crons from DEV database, run:');
    console.log('   TARGET_DEV_DB=true node backend/clean-test-crons-api.js');
    console.log('   OR: node backend/clean-test-crons-api.js --dev');
    console.log('\n💡 To clean test crons in production (dangerous), run:');
    console.log('   ALLOW_PROD_CLEANUP=true node backend/clean-test-crons-api.js');
    
    if (!process.env.ALLOW_PROD_CLEANUP) {
      console.log('\n❌ Aborting production cleanup. Use dev targeting instead.');
      return { successCount: 0, errorCount: 0, results: [], aborted: true };
    }
    
    console.log('\n🔓 ALLOW_PROD_CLEANUP detected. Proceeding with production cleanup...');
    console.log('⚠️  Please ensure you know what you\'re doing!\n');
  } else if (forceDevCleanup) {
    console.log('🎯 DEV database targeting enabled. Proceeding with test cron cleanup...');
  }

  const results = [];
  let successCount = 0;
  let errorCount = 0;

  for (const cronId of testCronIds) {
    console.log(`🗑️  Deleting cron job: ${cronId}...`);
    const result = await deleteCronJob(cronId);
    results.push(result);
    
    if (result.success) {
      successCount++;
    } else {
      errorCount++;
    }

    // Brief delay between requests
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log(`\n📈 Cleanup Summary:`);
  console.log(`   ✅ Successfully deleted: ${successCount} jobs`);
  console.log(`   ❌ Failed deletions: ${errorCount} jobs`);

  if (successCount > 0) {
    console.log('\n🎉 Cleanup complete! Your cron monitor should now show only production jobs.');
    console.log('💡 Refresh your Settings → System → Cron Jobs page to see the cleaned interface.');
    console.log(`⚡ The C.A.R.E. Customer Adaptive Response Engine should remain untouched.`);
  }

  if (errorCount > 0) {
    console.log('\n⚠️  Some deletions failed. This might be due to:');
    console.log('   - The cron job was already deleted');
    console.log('   - Permission issues');
    console.log('   - The cron job ID has changed');
    console.log('\n💡 Check the cron jobs page to see which ones still exist.');
  }

  return { successCount, errorCount, results };
}

// Run the cleanup
cleanTestCronsViaApi()
  .then(result => {
    if (result.aborted) {
      console.log('\n🛑 Cleanup aborted for safety reasons.');
      process.exit(0);
    }
    
    console.log(`\n✨ Final result: ${result.successCount}/${testCronIds.length} test crons deleted`);
    process.exit(result.errorCount > 0 ? 1 : 0);
  })
  .catch(error => {
    console.error('\n💥 Script failed:', error.message);
    process.exit(1);
  });