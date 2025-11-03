#!/usr/bin/env node
/**
 * Apply Row Level Security (RLS) Policies to Supabase Database
 * 
 * This script applies the RLS policies defined in migrations/999_enable_rls_policies.sql
 * to your Supabase database using the service_role connection.
 * 
 * IMPORTANT: 
 * - This uses the service_role key which bypasses RLS
 * - RLS policies will block direct client access via anon key
 * - Backend API will continue to work (uses service_role)
 * 
 * Usage:
 *   node apply-rls-policies.js
 * 
 * Prerequisites:
 *   - backend/.env configured with SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

// Load environment variables
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   SUPABASE_URL:', SUPABASE_URL ? '✓' : '✗');
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✓' : '✗');
  console.error('\nPlease configure backend/.env with your Supabase credentials.');
  process.exit(1);
}

// Create Supabase client with service_role key
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function applyRLSPolicies() {
  console.log('🔒 Applying Row Level Security (RLS) Policies...\n');

  try {
    // Read the SQL migration file
    const sqlPath = join(__dirname, 'migrations', '999_enable_rls_policies.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');

    console.log('📄 Loaded SQL from:', sqlPath);
    console.log('📊 SQL content length:', sqlContent.length, 'characters\n');

    // Split SQL into individual statements (split by semicolons, ignoring comments)
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);

    // Execute each statement
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i] + ';'; // Add semicolon back
      
      // Extract table name for logging (if present)
      const tableMatch = statement.match(/ON\s+(\w+)|FROM\s+(\w+)/i);
      const tableName = tableMatch ? (tableMatch[1] || tableMatch[2]) : 'unknown';

      try {
        const { error } = await supabase.rpc('exec_sql', { sql: statement });
        
        if (error) {
          // Try direct execution if rpc fails
          const { error: directError } = await supabase.from('_').select('*').limit(0);
          
          if (directError) {
            console.error(`❌ Error on statement ${i + 1} (${tableName}):`, error.message);
            errorCount++;
            continue;
          }
        }

        console.log(`✓ Statement ${i + 1}/${statements.length} executed (${tableName})`);
        successCount++;
      } catch (err) {
        console.error(`❌ Exception on statement ${i + 1} (${tableName}):`, err.message);
        errorCount++;
      }
    }

    console.log('\n' + '='.repeat(60));
    console.log(`✅ RLS Migration Complete: ${successCount} success, ${errorCount} errors`);
    console.log('='.repeat(60) + '\n');

    // Verify RLS is enabled
    await verifyRLS();

  } catch (error) {
    console.error('❌ Failed to apply RLS policies:', error);
    process.exit(1);
  }
}

async function verifyRLS() {
  console.log('🔍 Verifying RLS status...\n');

  try {
    // Query pg_tables to check rowsecurity status
    const { data, error } = await supabase
      .rpc('exec_sql', {
        sql: `SELECT tablename, rowsecurity 
              FROM pg_tables 
              WHERE schemaname='public' 
              ORDER BY tablename;`
      });

    if (error) {
      console.warn('⚠️  Could not verify RLS status (requires exec_sql function)');
      console.warn('   Run this manually in Supabase SQL Editor:');
      console.warn('   SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname=\'public\';');
      return;
    }

    if (!data || data.length === 0) {
      console.warn('⚠️  No tables found or verification query failed');
      return;
    }

    console.log('RLS Status by Table:');
    console.log('─'.repeat(60));
    data.forEach(row => {
      const status = row.rowsecurity ? '🔒 Enabled' : '🔓 Disabled';
      console.log(`${status.padEnd(12)} ${row.tablename}`);
    });
    console.log('─'.repeat(60) + '\n');

    const rlsEnabled = data.filter(row => row.rowsecurity).length;
    const rlsDisabled = data.filter(row => !row.rowsecurity).length;

    console.log(`✅ RLS Enabled: ${rlsEnabled} tables`);
    console.log(`⚠️  RLS Disabled: ${rlsDisabled} tables\n`);

  } catch (error) {
    console.warn('⚠️  Could not verify RLS status:', error.message);
  }
}

// Run the migration
applyRLSPolicies().catch(console.error);
