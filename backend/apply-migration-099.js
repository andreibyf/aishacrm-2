/**
 * Apply migration 099 - Make tenant_id_legacy/tenant_id_text nullable
 * Run with: doppler run -c prd -- node apply-migration-099.js
 */

import pg from 'pg';
const { Pool } = pg;

async function run() {
  console.log('Connecting to production database...');
  console.log('DATABASE_URL exists:', !!process.env.DATABASE_URL);
  
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set!');
    process.exit(1);
  }
  
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });
  
  try {
    // Test connection
    const test = await pool.query('SELECT current_database() as db');
    console.log('Connected to:', test.rows[0].db);
    
    // Check current column state for bizdev_sources
    const checkBizdev = await pool.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'bizdev_sources' 
      AND column_name IN ('tenant_id_legacy', 'tenant_id_text')
    `);
    console.log('\nbizdev_sources tenant columns:', checkBizdev.rows);
    
    // Check current column state for system_logs
    const checkLogs = await pool.query(`
      SELECT column_name, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'system_logs' 
      AND column_name IN ('tenant_id_legacy', 'tenant_id_text')
    `);
    console.log('system_logs tenant columns:', checkLogs.rows);
    
    // Apply migration - make tenant_id_text nullable if it exists and is NOT NULL
    for (const row of checkBizdev.rows) {
      if (row.is_nullable === 'NO') {
        console.log(`\nMaking bizdev_sources.${row.column_name} nullable...`);
        await pool.query(`ALTER TABLE bizdev_sources ALTER COLUMN ${row.column_name} DROP NOT NULL`);
        console.log(`✅ bizdev_sources.${row.column_name} is now nullable`);
      } else {
        console.log(`✓ bizdev_sources.${row.column_name} is already nullable`);
      }
    }
    
    for (const row of checkLogs.rows) {
      if (row.is_nullable === 'NO') {
        console.log(`\nMaking system_logs.${row.column_name} nullable...`);
        await pool.query(`ALTER TABLE system_logs ALTER COLUMN ${row.column_name} DROP NOT NULL`);
        console.log(`✅ system_logs.${row.column_name} is now nullable`);
      } else {
        console.log(`✓ system_logs.${row.column_name} is already nullable`);
      }
    }
    
    console.log('\n✅ Migration 099 complete');
    
  } catch (e) {
    console.error('Error:', e.message);
    console.error('Full error:', e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
