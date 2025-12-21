#!/usr/bin/env node
/**
 * Apply Migration 097: Construction Projects Module (Direct PostgreSQL)
 * Run with: doppler run -- node apply-migration-097-pgpool.js
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('='.repeat(60));
  console.log('Migration 097: Construction Projects Module');
  console.log('='.repeat(60));

  if (!process.env.DATABASE_URL) {
    console.error('\n❌ DATABASE_URL not set! Run with: doppler run -- node apply-migration-097-pgpool.js');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    // Test connection
    const test = await pool.query('SELECT current_database() as db');
    console.log('\n📡 Connected to database:', test.rows[0].db);

    // Read migration file
    const migrationPath = join(__dirname, 'migrations', '097_construction_projects_module.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('\n📄 Loaded migration from:', migrationPath);
    console.log('📊 SQL length:', sql.length, 'characters\n');

    // Split by statement terminators and execute
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 10 && !s.startsWith('--')); // Filter out tiny fragments and comments

    console.log(`📝 Executing ${statements.length} SQL statements...\n`);

    let successCount = 0;
    let existsCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      
      try {
        await pool.query(stmt);
        successCount++;
        process.stdout.write(`✓ ${i + 1}/${statements.length}\r`);
      } catch (err) {
        // Ignore "already exists" errors
        if (err.message.includes('already exists') || err.message.includes('duplicate')) {
          existsCount++;
          process.stdout.write(`⊙ ${i + 1}/${statements.length} (exists)\r`);
          continue;
        }
        console.error(`\n❌ Error at statement ${i + 1}:`, err.message);
        console.error('Statement preview:', stmt.substring(0, 150) + '...');
        throw err;
      }
    }

    console.log(`\n\n✅ Migration completed:`);
    console.log(`   - New objects: ${successCount}`);
    console.log(`   - Already existed: ${existsCount}`);
    console.log(`   - Total processed: ${statements.length}`);

    // Verify tables exist
    console.log('\n🔍 Verifying tables...');
    
    const { rows: projectsCheck } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'construction_projects'"
    );
    const { rows: assignmentsCheck } = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'construction_assignments'"
    );

    if (projectsCheck.length === 0) {
      throw new Error('construction_projects table not found after migration');
    }
    if (assignmentsCheck.length === 0) {
      throw new Error('construction_assignments table not found after migration');
    }

    console.log('✅ Tables verified:');
    console.log('   - construction_projects: ✓');
    console.log('   - construction_assignments: ✓');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration 097 completed successfully!');
    console.log('='.repeat(60));

    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Migration failed:', error.message);
    console.error('='.repeat(60));
    if (error.stack) {
      console.error(error.stack);
    }
    await pool.end();
    process.exit(1);
  }
}

applyMigration();
