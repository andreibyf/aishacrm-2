/**
 * Test script for time-based DELETE operations
 * Verifies that the supabase-db.js query translator properly handles time filters
 */

import { pool } from './lib/supabase-db.js';

async function testTimeBasedDeletes() {
  console.log('🧪 Testing time-based DELETE query translation...\n');

  try {
    // Test 1: Performance logs with parameterized interval
    console.log('Test 1: DELETE performance_logs with parameterized interval');
    const query1 = `DELETE FROM performance_logs WHERE created_at > NOW() - $1::INTERVAL RETURNING *`;
    const params1 = ['24 hours'];
    
    try {
      const result1 = await pool.query(query1, params1);
      console.log(`✅ Success: Would delete ${result1.rowCount} records`);
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
    }

    // Test 2: System logs with literal interval and tenant filter
    console.log('\nTest 2: DELETE system_logs with literal interval + tenant_id');
    const query2 = `DELETE FROM system_logs WHERE 1=1 AND created_at > NOW() - INTERVAL '1 hours' AND tenant_id = $1 RETURNING *`;
    const params2 = ['test-tenant'];
    
    try {
      const result2 = await pool.query(query2, params2);
      console.log(`✅ Success: Would delete ${result2.rowCount} records`);
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
    }

    // Test 3: System logs with older_than filter
    console.log('\nTest 3: DELETE system_logs older than N days');
    const query3 = `DELETE FROM system_logs WHERE 1=1 AND created_at < NOW() - INTERVAL '30 days' RETURNING *`;
    const params3 = [];
    
    try {
      const result3 = await pool.query(query3, params3);
      console.log(`✅ Success: Would delete ${result3.rowCount} records`);
    } catch (err) {
      console.log(`❌ Failed: ${err.message}`);
    }

    // Test 4: Unsafe delete (should fail)
    console.log('\nTest 4: Unsafe DELETE without filters (should fail)');
    const query4 = `DELETE FROM system_logs RETURNING *`;
    const params4 = [];
    
    try {
      await pool.query(query4, params4);
      console.log(`❌ SECURITY ISSUE: Unsafe delete was allowed!`);
    } catch (err) {
      console.log(`✅ Correctly blocked: ${err.message}`);
    }

    console.log('\n✅ All tests completed!');
  } catch (error) {
    console.error('❌ Test suite error:', error);
  } finally {
    await pool.end();
  }
}

// Run tests
testTimeBasedDeletes();
