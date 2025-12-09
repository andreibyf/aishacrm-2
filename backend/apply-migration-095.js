/**
 * Apply Entity Labels Migration (095)
 * 
 * Creates the entity_labels table for custom CRM entity naming per tenant.
 * 
 * Usage:
 *   cd backend
 *   node apply-migration-095.js
 * 
 * Or with explicit DATABASE_URL:
 *   DATABASE_URL=postgresql://... node apply-migration-095.js
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set. Please set it in .env or environment.');
  process.exit(1);
}

async function applyMigration() {
  console.log('🚀 Applying Entity Labels Migration (095)...');
  console.log(`📍 Database: ${DATABASE_URL.replace(/:[^:@]+@/, ':****@')}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // Read the migration SQL
    const migrationPath = path.join(__dirname, 'migrations', '095_entity_labels.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n📄 Migration SQL:');
    console.log('─'.repeat(60));
    console.log(sql.slice(0, 500) + (sql.length > 500 ? '\n...' : ''));
    console.log('─'.repeat(60));

    // Execute the migration
    await pool.query(sql);

    console.log('\n✅ Migration applied successfully!');

    // Verify table exists
    const verifyResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'entity_labels'
      ORDER BY ordinal_position
    `);

    if (verifyResult.rows.length > 0) {
      console.log('\n📋 Table structure:');
      verifyResult.rows.forEach(row => {
        console.log(`   - ${row.column_name}: ${row.data_type}`);
      });
    }

    // Check RLS policies
    const rlsResult = await pool.query(`
      SELECT polname, polcmd 
      FROM pg_policies 
      WHERE tablename = 'entity_labels'
    `);

    if (rlsResult.rows.length > 0) {
      console.log('\n🔒 RLS Policies:');
      rlsResult.rows.forEach(row => {
        console.log(`   - ${row.polname} (${row.polcmd})`);
      });
    }

    console.log('\n🎉 Entity Labels feature is ready!');

  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('\n⚠️  Table or constraint already exists - migration may have been applied before.');
      console.log('   This is safe to ignore if the table is working correctly.');
    } else {
      console.error('\n❌ Migration failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

applyMigration();
