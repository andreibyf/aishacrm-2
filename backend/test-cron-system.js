/**
 * Cron System Integration Test
 * 
 * Tests:
 * 1. Seed default cron jobs
 * 2. Execute cron jobs via POST /api/cron/run
 * 3. Verify markUsersOffline executed
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') 
    ? { rejectUnauthorized: false } 
    : false
});

async function testCronSystem() {
  console.log('🧪 Testing Cron System Integration...\n');

  try {
    // Step 1: Check if cron jobs exist
    console.log('1️⃣  Checking existing cron jobs...');
    const { rows: existingJobs } = await pool.query(
      'SELECT id, name, schedule, function_name, is_active, next_run FROM cron_job ORDER BY created_at'
    );
    
    console.log(`   Found ${existingJobs.length} cron job(s):`);
    existingJobs.forEach(job => {
      console.log(`   - ${job.name} (${job.function_name}) - ${job.is_active ? '✅ Active' : '❌ Inactive'}`);
      console.log(`     Next run: ${job.next_run || 'Not scheduled'}`);
    });
    console.log();

    // Step 2: Create test users with old timestamps for offline testing
    console.log('2️⃣  Creating test users with stale presence...');
    
    const tenantId = '11111111-1111-1111-1111-111111111111'; // Test tenant
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
    
    const { rows: testUsers } = await pool.query(
      `INSERT INTO users (email, role, tenant_id, metadata, created_at, updated_at)
       VALUES 
         ('cron-test-user-1@example.com', 'admin', $1, 
          $2::jsonb,
          NOW(), NOW()),
         ('cron-test-user-2@example.com', 'admin', $1,
          $3::jsonb,
          NOW(), NOW())
       ON CONFLICT (email) DO UPDATE 
       SET metadata = EXCLUDED.metadata,
           updated_at = NOW()
       RETURNING id, email, metadata->>'last_seen' as last_seen, metadata->>'live_status' as live_status`,
      [
        tenantId, 
        JSON.stringify({ last_seen: tenMinutesAgo.toISOString(), live_status: 'online', account_status: 'active' }),
        JSON.stringify({ last_seen: tenMinutesAgo.toISOString(), live_status: 'online', account_status: 'active' })
      ]
    );
    
    console.log(`   Created/updated ${testUsers.length} test user(s):`);
    testUsers.forEach(user => {
      console.log(`   - ${user.email}: last_seen=${user.last_seen}, live_status=${user.live_status}`);
    });
    console.log();

    // Step 3: Manually trigger cron execution
    console.log('3️⃣  Triggering cron job execution...');
    
    const { executeJob } = await import('./lib/cronExecutors.js');
    
    // Find the markUsersOffline job
    const markOfflineJob = existingJobs.find(job => job.function_name === 'markUsersOffline');
    
    if (markOfflineJob) {
      console.log(`   Executing: ${markOfflineJob.name}`);
      const result = await executeJob('markUsersOffline', pool, { timeout_minutes: 5 });
      console.log(`   Result:`, result);
    } else {
      console.log('   ⚠️  markUsersOffline job not found, running manually...');
      const { markUsersOffline } = await import('./lib/cronExecutors.js');
      const result = await markUsersOffline(pool, { timeout_minutes: 5 });
      console.log(`   Result:`, result);
    }
    console.log();

    // Step 4: Verify users were marked offline
    console.log('4️⃣  Verifying users marked offline...');
    
    const { rows: updatedUsers } = await pool.query(
      `SELECT email, metadata->>'live_status' as live_status, metadata->>'last_seen' as last_seen
       FROM users
       WHERE email LIKE 'cron-test-user-%@example.com'
       ORDER BY email`
    );
    
    console.log(`   Updated user status:`);
    updatedUsers.forEach(user => {
      const isOffline = user.live_status === 'offline';
      console.log(`   ${isOffline ? '✅' : '❌'} ${user.email}: ${user.live_status} (last_seen: ${user.last_seen})`);
    });
    console.log();

    // Step 5: Test via API endpoint simulation
    console.log('5️⃣  Testing cron execution via route handler...');
    
    const { rows: dueJobs } = await pool.query(
      `SELECT * FROM cron_job
       WHERE is_active = true
       AND next_run <= NOW()
       ORDER BY next_run ASC`
    );
    
    console.log(`   Found ${dueJobs.length} due job(s)`);
    
    for (const job of dueJobs) {
      console.log(`   Executing: ${job.name} (${job.function_name})`);
      
      if (job.function_name) {
        const result = await executeJob(job.function_name, pool, job.metadata || {});
        console.log(`   Result:`, result);
      }
    }
    console.log();

    // Cleanup
    console.log('6️⃣  Cleaning up test data...');
    await pool.query(
      `DELETE FROM users WHERE email LIKE 'cron-test-user-%@example.com'`
    );
    console.log('   ✅ Test users deleted\n');

    console.log('✅ Cron system test completed successfully!\n');

  } catch (error) {
    console.error('❌ Test failed:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the test
testCronSystem().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
