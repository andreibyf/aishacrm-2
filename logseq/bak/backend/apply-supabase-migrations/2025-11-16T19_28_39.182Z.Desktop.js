/**
 * Apply migrations to Supabase Cloud DEV/QA Database
 * Run: node apply-supabase-migrations.js
 */

import pkg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const { Client } = pkg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env.local') });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in .env.local');
  process.exit(1);
}

console.log('🔗 Connecting to Supabase Cloud DEV/QA...');
console.log(`📍 ${connectionString.replace(/:([^:@]+)@/, ':****@')}`);

const client = new Client({
  connectionString: connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

// Discover all .sql migrations and apply in lexical order
const migrationsDir = path.join(__dirname, 'migrations');
let migrations = fs.readdirSync(migrationsDir)
  .filter(f => f.endsWith('.sql'))
  .sort((a, b) => a.localeCompare(b));

async function applyMigrations() {
  try {
    await client.connect();
    console.log('✅ Connected to Supabase Cloud\n');

    for (const migration of migrations) {
      const migrationPath = path.join(__dirname, 'migrations', migration);
      
      if (!fs.existsSync(migrationPath)) {
        console.log(`⏭️  Skipping ${migration} (file not found)`);
        continue;
      }

      console.log(`📄 Applying ${migration}...`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      
      try {
        await client.query(sql);
        console.log(`✅ ${migration} applied successfully\n`);
      } catch (error) {
        console.error(`❌ Error applying ${migration}:`, error.message);
        if (error.message.includes('already exists')) {
          console.log(`   (Table/object already exists, continuing...)\n`);
        } else {
          throw error;
        }
      }
    }

    // Verify tables were created
    console.log('🔍 Verifying tables...');
    const result = await client.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log('\n📊 Tables in database:');
    result.rows.forEach(row => {
      console.log(`   ✓ ${row.tablename}`);
    });

    console.log('\n✅ Migration completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Start the backend: cd backend && npm run dev');
    console.log('   2. Test CRUD operations in the app');
    console.log('   3. Run Unit Tests (Settings → Unit Tests)');
    
  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigrations();
