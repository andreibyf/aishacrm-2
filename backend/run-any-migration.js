/**
 * Generic Migration Runner
 * Usage: node run-any-migration.js <migration-file-name>
 * Example: node run-any-migration.js 051_fix_table_name_consistency.sql
 */

import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

async function runMigration(migrationFile) {
  console.log(`🚀 Starting migration: ${migrationFile}\n`);

  const DATABASE_URL = process.env.DATABASE_URL;
  if (!DATABASE_URL) {
    console.error('❌ ERROR: DATABASE_URL not found in .env');
    process.exit(1);
  }

  console.log('📊 Database:', DATABASE_URL.replace(/:([^:@]+)@/, ':****@'));
  console.log('🔐 SSL Mode:', process.env.DB_SSL === 'true' ? 'Enabled' : 'Disabled');
  console.log('');

  const poolConfig = {
    connectionString: DATABASE_URL,
  };

  // Only add SSL if explicitly enabled
  if (process.env.DB_SSL === 'true') {
    poolConfig.ssl = { rejectUnauthorized: false };
  }

  const pool = new Pool(poolConfig);

  // Set up notice handler to capture RAISE NOTICE messages
  const notices = [];
  pool.on('notice', (msg) => {
    notices.push(msg.message);
  });

  try {
    // Test connection
    console.log('📡 Testing connection...');
    const connTest = await pool.query('SELECT current_database(), current_user, version()');
    console.log('✅ Connected successfully');
    console.log(`   Database: ${connTest.rows[0].current_database}`);
    console.log(`   User: ${connTest.rows[0].current_user}`);
    console.log('');

    // Read migration file
    const migrationPath = join(__dirname, 'migrations', migrationFile);
    console.log('📄 Reading migration file...');
    const sql = readFileSync(migrationPath, 'utf8');
    console.log(`   ${sql.split('\n').length} lines loaded`);
    console.log('');

    // Execute migration
    console.log('⚙️  Executing migration...');
    const startTime = Date.now();
    await pool.query(sql);
    const duration = Date.now() - startTime;
    
    console.log('');
    console.log('✅ Migration executed successfully!');
    console.log(`   Duration: ${duration}ms`);
    console.log('');

    // Display any notices from the migration
    if (notices.length > 0) {
      console.log('📋 Migration output:');
      notices.forEach(notice => {
        console.log(`   ${notice}`);
      });
      console.log('');
    }

    // Verify tables exist
    console.log('🔍 Verifying tables...');
    const tablesQuery = `
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      AND tablename IN ('performance_logs', 'bizdev_sources')
      ORDER BY tablename;
    `;
    const tables = await pool.query(tablesQuery);
    
    if (tables.rows.length > 0) {
      console.log('   Tables found:');
      tables.rows.forEach(row => {
        console.log(`   ✅ ${row.tablename}`);
      });
    } else {
      console.log('   ⚠️  No tables found (they may not exist in this database)');
    }
    console.log('');

    console.log('=' .repeat(60));
    console.log('✅ MIGRATION COMPLETED SUCCESSFULLY');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed:', error.message);
    if (error.detail) console.error('   Detail:', error.detail);
    if (error.hint) console.error('   Hint:', error.hint);
    if (error.position) console.error('   Position:', error.position);
    console.error('');
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Get migration file from command line
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('❌ Usage: node run-any-migration.js <migration-file>');
  console.error('   Example: node run-any-migration.js 051_fix_table_name_consistency.sql');
  process.exit(1);
}

runMigration(migrationFile);
