#!/usr/bin/env node

/**
 * Clean Test Cron Jobs
 * 
 * This script safely removes test/development cron jobs while preserving
 * production jobs like the C.A.R.E. Customer Adaptive Response Engine.
 * 
 * Usage: node backend/clean-test-crons.js
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', !!SUPABASE_URL);
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', !!SUPABASE_SERVICE_KEY);
  console.error('');
  console.error('💡 Make sure to run with doppler:');
  console.error('   doppler run -- node backend/clean-test-crons.js');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function cleanTestCrons() {
  console.log('🔍 Fetching tenant-specific cron jobs...\n');

  const tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

  // Get tenant-specific cron jobs (the ones you see in the UI)
  const { data: jobs, error } = await supabase
    .from('cron_job')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error fetching cron jobs:', error);
    return;
  }

  console.log(`📋 Found ${jobs.length} tenant-specific cron jobs:\n`);

  // Categorize jobs
  const testJobs = [];
  const productionJobs = [];

  for (const job of jobs) {
    const name = job.name.toLowerCase();
    const func = job.function_name.toLowerCase();
    
    // Identify test jobs by name patterns
    const isTestJob = 
      name.includes('test') ||
      func.includes('test') ||
      name.includes('new test') ||
      name.includes('updated test');

    if (isTestJob) {
      testJobs.push(job);
    } else {
      productionJobs.push(job);
    }

    const status = job.is_active ? '🟢 Active' : '🔴 Inactive';
    const execCount = job.execution_count || 0;
    const category = isTestJob ? '🧪 TEST' : '⚡ PROD';
    
    console.log(`${category} ${status} | ${job.name} (${job.function_name}) | Executions: ${execCount}`);
  }

  console.log(`\n📊 Summary:`);
  console.log(`   🧪 Test Jobs: ${testJobs.length}`);
  console.log(`   ⚡ Production Jobs: ${productionJobs.length}`);

  if (testJobs.length === 0) {
    console.log('\n✅ No test cron jobs found to clean up!');
    return;
  }

  console.log(`\n🧪 Test jobs to be deleted:`);
  testJobs.forEach((job, i) => {
    const status = job.is_active ? 'Active' : 'Inactive';
    const execCount = job.execution_count || 0;
    console.log(`   ${i + 1}. ${job.name} (${status}, ${execCount} executions)`);
  });

  console.log(`\n⚡ Production jobs to be preserved:`);
  if (productionJobs.length === 0) {
    console.log('   (none found)');
  } else {
    productionJobs.forEach((job, i) => {
      const status = job.is_active ? 'Active' : 'Inactive';
      const execCount = job.execution_count || 0;
      console.log(`   ${i + 1}. ${job.name} (${status}, ${execCount} executions)`);
    });
  }

  // Confirmation prompt
  console.log(`\n⚠️  Are you sure you want to DELETE ${testJobs.length} test cron jobs? (y/N)`);
  
  // Simple confirmation (in real usage, you could add readline for interactive confirmation)
  const confirm = process.argv.includes('--yes') || process.argv.includes('-y');
  
  if (!confirm) {
    console.log('❌ Operation cancelled. Run with --yes or -y to confirm deletion.');
    console.log('   Example: node backend/clean-test-crons.js --yes');
    return;
  }

  console.log('\n🗑️  Deleting test cron jobs...\n');

  let deleteCount = 0;
  let errorCount = 0;

  for (const job of testJobs) {
    try {
      const { error: deleteError } = await supabase
        .from('cron_job')
        .delete()
        .eq('id', job.id);

      if (deleteError) {
        console.error(`❌ Failed to delete "${job.name}":`, deleteError.message);
        errorCount++;
      } else {
        console.log(`✅ Deleted: ${job.name} (ID: ${job.id})`);
        deleteCount++;
      }
    } catch (err) {
      console.error(`❌ Error deleting "${job.name}":`, err.message);
      errorCount++;
    }
  }

  console.log(`\n📈 Cleanup Summary:`);
  console.log(`   ✅ Successfully deleted: ${deleteCount} jobs`);
  console.log(`   ❌ Failed deletions: ${errorCount} jobs`);
  console.log(`   ⚡ Production jobs preserved: ${productionJobs.length} jobs`);

  if (deleteCount > 0) {
    console.log('\n🎉 Cleanup complete! Your cron monitor should now show only production jobs.');
    console.log('💡 Refresh your Settings → System → Cron Jobs page to see the cleaned interface.');
  }
}

// Run the cleanup
cleanTestCrons().catch(console.error);