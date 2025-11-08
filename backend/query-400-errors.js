import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function query400Errors() {
  try {
    console.log('\n🔍 Querying 400 Validation Errors from performance_logs...\n');
    
    const result = await pool.query(`
      SELECT 
        endpoint, 
        status_code, 
        error_message, 
        COUNT(*) as count, 
        MAX(created_at) as last_seen,
        MIN(created_at) as first_seen
      FROM performance_logs 
      WHERE status_code = 400 
      GROUP BY endpoint, status_code, error_message 
      ORDER BY count DESC 
      LIMIT 20
    `);

    if (result.rows.length === 0) {
      console.log('✅ No 400 errors found in performance_logs');
    } else {
      console.log(`Found ${result.rows.length} distinct 400 error patterns:\n`);
      result.rows.forEach((row, index) => {
        console.log(`${index + 1}. ${row.endpoint}`);
        console.log(`   Status: ${row.status_code}`);
        console.log(`   Error: ${row.error_message}`);
        console.log(`   Count: ${row.count}`);
        console.log(`   First: ${row.first_seen}`);
        console.log(`   Last: ${row.last_seen}`);
        console.log('');
      });
    }

    // Also check total performance logs count
    const totalResult = await pool.query('SELECT COUNT(*) FROM performance_logs');
    console.log(`Total performance logs: ${totalResult.rows[0].count}`);

    // Check recent logs (any status)
    const recentResult = await pool.query(`
      SELECT endpoint, status_code, error_message, created_at 
      FROM performance_logs 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.log('\n📝 Last 10 performance logs (all statuses):\n');
    recentResult.rows.forEach((row, index) => {
      console.log(`${index + 1}. [${row.status_code}] ${row.endpoint}`);
      if (row.error_message) console.log(`   Error: ${row.error_message}`);
      console.log(`   Time: ${row.created_at}`);
      console.log('');
    });

  } catch (error) {
    console.error('❌ Error querying performance_logs:', error.message);
    console.error(error.stack);
  } finally {
    await pool.end();
  }
}

query400Errors();
