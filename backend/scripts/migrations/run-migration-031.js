/**
 * Migration Runner for 031_create_ai_campaigns.sql
 * Executes the migration using the existing database connection
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

async function runMigration() {
  console.log('🚀 Starting migration 031_create_ai_campaigns.sql...\n');

  // Create database pool
  const DATABASE_URL = process.env.DATABASE_URL;

  if (!DATABASE_URL) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  console.log('📊 Database URL:', DATABASE_URL.replace(/:([^@]+)@/, ':****@'));

  const pool = new Pool({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    // Test connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection successful\n');

    // Read migration file
    const migrationPath = join(__dirname, 'migrations', '031_create_ai_campaigns.sql');
    console.log('📄 Reading migration file:', migrationPath);
    const migrationSQL = readFileSync(migrationPath, 'utf8');

    console.log('📝 Migration SQL preview:');
    console.log(migrationSQL.substring(0, 200) + '...\n');

    // Execute migration
    console.log('⚙️  Executing migration...');
    await pool.query(migrationSQL);

    console.log('✅ Migration completed successfully!');

    // Verify table was created
    const verifyResult = await pool.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'ai_campaigns'
      ORDER BY ordinal_position
    `);

    console.log('\n✅ Table ai_campaigns created with columns:');
    verifyResult.rows.forEach((row) => {
      console.log(`   - ${row.column_name} (${row.data_type})`);
    });

    // Check indexes
    const indexResult = await pool.query(`
      SELECT indexname
      FROM pg_indexes
      WHERE tablename = 'ai_campaigns'
    `);

    console.log('\n✅ Indexes created:');
    indexResult.rows.forEach((row) => {
      console.log(`   - ${row.indexname}`);
    });
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error('Stack trace:', error.stack);
    process.exit(1);
  } finally {
    await pool.end();
    console.log('\n🔚 Database connection closed');
  }
}

runMigration();
