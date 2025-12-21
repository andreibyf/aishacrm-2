#!/usr/bin/env node
/**
 * Apply Migration 097: Construction Projects Module
 * Creates construction_projects and construction_assignments tables
 */

import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment
dotenv.config({ path: '.env.local' });
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function applyMigration() {
  console.log('='.repeat(60));
  console.log('Migration 097: Construction Projects Module');
  console.log('='.repeat(60));

  try {
    // Import and initialize Supabase client
    const { initSupabaseDB, getSupabaseClient } = await import('./lib/supabase-db.js');
    initSupabaseDB(); // Initialize before getting client
    const supabase = getSupabaseClient();

    // Read migration file
    const migrationPath = join(__dirname, 'migrations', '097_construction_projects_module.sql');
    const sql = readFileSync(migrationPath, 'utf8');

    console.log('\n📄 Loaded migration from:', migrationPath);
    console.log('📊 SQL length:', sql.length, 'characters');

    // Check if tables already exist
    console.log('\n🔍 Checking if tables exist...');
    const { data: existingProjects, error: checkProjectsErr } = await supabase
      .from('construction_projects')
      .select('id')
      .limit(1);

    const { data: existingAssignments, error: checkAssignmentsErr } = await supabase
      .from('construction_assignments')
      .select('id')
      .limit(1);

    if (!checkProjectsErr && !checkAssignmentsErr) {
      console.log('✅ Tables already exist, migration may have been applied');
      console.log('   - construction_projects: EXISTS');
      console.log('   - construction_assignments: EXISTS');
      
      // Still try to run migration (CREATE IF NOT EXISTS is safe)
      console.log('\n⚠️  Re-running migration (safe with IF NOT EXISTS)...');
    } else {
      console.log('📋 Tables not found, applying migration...');
    }

    // Apply migration using raw SQL
    // Note: Supabase client doesn't support raw SQL execution directly
    // We need to use the service role key and REST API
    console.log('\n🚀 Applying migration via Supabase Admin API...');
    
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment');
    }

    // Use pg-sql2 endpoint to execute raw SQL
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      // Fallback: Try using pgPool directly
      console.log('⚠️  REST API approach failed, using direct PostgreSQL connection...');
      const { pgPool } = await import('./pgPool.js');
      
      if (!pgPool) {
        throw new Error('No database connection available');
      }

      // Split by statement terminators and execute
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));

      console.log(`\n📝 Executing ${statements.length} SQL statements...`);

      for (let i = 0; i < statements.length; i++) {
        const stmt = statements[i];
        if (stmt.length < 10) continue; // Skip tiny fragments
        
        try {
          await pgPool.query(stmt);
          process.stdout.write(`✓ Statement ${i + 1}/${statements.length}\r`);
        } catch (err) {
          // Ignore "already exists" errors
          if (err.message.includes('already exists')) {
            process.stdout.write(`⊙ Statement ${i + 1}/${statements.length} (exists)\r`);
            continue;
          }
          console.error(`\n❌ Error at statement ${i + 1}:`, err.message);
          console.error('Statement:', stmt.substring(0, 100) + '...');
          throw err;
        }
      }

      console.log(`\n✅ Executed ${statements.length} statements successfully`);
    } else {
      console.log('✅ Migration applied via REST API');
    }

    // Verify tables exist
    console.log('\n🔍 Verifying tables...');
    const { data: verifyProjects, error: verifyProjErr } = await supabase
      .from('construction_projects')
      .select('count')
      .limit(1);

    const { data: verifyAssignments, error: verifyAssignErr } = await supabase
      .from('construction_assignments')
      .select('count')
      .limit(1);

    if (verifyProjErr) {
      throw new Error(`construction_projects verification failed: ${verifyProjErr.message}`);
    }
    if (verifyAssignErr) {
      throw new Error(`construction_assignments verification failed: ${verifyAssignErr.message}`);
    }

    console.log('✅ Tables verified successfully');
    console.log('   - construction_projects: ✓');
    console.log('   - construction_assignments: ✓');

    console.log('\n' + '='.repeat(60));
    console.log('✅ Migration 097 completed successfully!');
    console.log('='.repeat(60));

    process.exit(0);
  } catch (error) {
    console.error('\n' + '='.repeat(60));
    console.error('❌ Migration failed:', error.message);
    console.error('='.repeat(60));
    console.error(error);
    process.exit(1);
  }
}

applyMigration();
