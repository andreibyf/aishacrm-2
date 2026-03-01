/**
 * Migration Runner for 031_create_ai_campaigns.sql
 * Run from backend directory: node run-migration.js
 */

import { readFileSync } from 'fs';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;

// Load environment variables from .env only
dotenv.config({ path: '.env' });

async function runMigration() {
  console.log('🚀 Starting migration 031_create_ai_campaigns.sql...\n');

  const DATABASE_URL =
    process.env.DATABASE_URL ||
    'postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres';

  console.log('📊 Database:', DATABASE_URL.replace(/:([^@]+)@/, ':****@'));

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Read migration file
    const sql = readFileSync('./migrations/031_create_ai_campaigns.sql', 'utf8');
    console.log('📄 Migration file loaded\n');

    // Execute migration
    console.log('⚙️  Executing migration...');
    await pool.query(sql);
    console.log('✅ Migration executed successfully!\n');

    // Verify table was created
    const verify = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ai_campaigns'
      ORDER BY ordinal_position
    `);

    if (verify.rows.length > 0) {
      console.log('✅ Table ai_campaigns created with columns:');
      verify.rows.forEach((row) => {
        console.log(`   - ${row.column_name} (${row.data_type})`);
      });
    } else {
      console.error('❌ Table verification failed - no columns found');
      process.exit(1);
    }

    // Check indexes
    const indexes = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'ai_campaigns'
    `);

    if (indexes.rows.length > 0) {
      console.log('\n✅ Indexes created:');
      indexes.rows.forEach((row) => {
        console.log(`   - ${row.indexname}`);
      });
    }

    console.log('\n✅ Migration completed successfully!');
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    if (error.message.includes('already exists')) {
      console.log('ℹ️  Table may already exist - checking...');
      try {
        // Table already exists; perform a lightweight count to confirm accessibility without storing result
        await pool.query('SELECT COUNT(*) FROM ai_campaigns');
        console.log('✅ Table ai_campaigns exists and is accessible');
      } catch (e) {
        console.error('❌ Table check failed:', e.message);
      }
    }
    process.exit(1);
  } finally {
    await pool.end();
    console.log('🔚 Database connection closed\n');
  }
}

runMigration();
