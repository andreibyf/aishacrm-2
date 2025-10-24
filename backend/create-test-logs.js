/**
 * Create test system logs to verify System Logs viewer
 */

import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false
});

async function createTestLogs() {
  try {
    console.log('Creating test system logs...\n');

    const testLogs = [
      {
        tenant_id: 'test-tenant',
        level: 'INFO',
        source: 'Backend Server',
        message: 'Backend server started successfully',
        user_email: 'system@aishacrm.com'
      },
      {
        tenant_id: 'test-tenant',
        level: 'INFO',
        source: 'Database',
        message: 'Database connection established to Supabase Cloud',
        user_email: 'system@aishacrm.com'
      },
      {
        tenant_id: 'test-tenant',
        level: 'WARNING',
        source: 'API',
        message: 'Slow API response detected (2.5s) for /api/contacts',
        user_email: 'admin@test.com'
      },
      {
        tenant_id: 'test-tenant',
        level: 'ERROR',
        source: 'Validation',
        message: 'Invalid email format provided: not-an-email',
        user_email: 'user@test.com'
      },
      {
        tenant_id: 'test-tenant',
        level: 'DEBUG',
        source: 'Cache',
        message: 'Cache hit for key: contacts_list_test-tenant',
        user_email: 'system@aishacrm.com'
      },
      {
        tenant_id: 'test-tenant',
        level: 'INFO',
        source: 'Authentication',
        message: 'User logged in successfully',
        user_email: 'admin@test.com'
      }
    ];

    for (const log of testLogs) {
      await pool.query(
        `INSERT INTO system_logs (tenant_id, level, source, message, user_email, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         RETURNING id`,
        [log.tenant_id, log.level, log.source, log.message, log.user_email]
      );
      
      console.log(`✓ Created ${log.level} log: ${log.message.substring(0, 50)}...`);
    }

    console.log(`\n✅ Successfully created ${testLogs.length} test logs`);
    console.log('Now refresh the System Logs viewer in the UI');

  } catch (error) {
    console.error('❌ Error creating test logs:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

createTestLogs();
