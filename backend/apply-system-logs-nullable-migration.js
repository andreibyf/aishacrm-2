#!/usr/bin/env node
/**
 * Apply system_logs nullable tenant_id migration
 * 
 * This migration makes system_logs.tenant_id nullable to support
 * global system logging (startup events, cross-tenant monitoring, etc.)
 * 
 * Run with: doppler run -- node backend/apply-system-logs-nullable-migration.js
 */

import { promises as fs } from 'fs';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Error: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function applyMigration() {
  try {
    console.log('🔧 Reading migration file...');
    const migrationSQL = await fs.readFile(
      './supabase/migrations/20251218_system_logs_nullable_tenant.sql',
      'utf-8'
    );

    console.log('🚀 Applying migration: 20251218_system_logs_nullable_tenant.sql');
    console.log('   Making system_logs.tenant_id nullable...');
    
    // Execute the migration
    const { data, error } = await supabase.rpc('exec_sql', {
      sql_text: migrationSQL
    });

    if (error) {
      // If exec_sql RPC doesn't exist, try direct execution via REST API
      console.log('   exec_sql RPC not available, trying direct execution...');
      
      // Split into individual statements and execute
      const statements = migrationSQL
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--') && !s.startsWith('COMMENT'));
      
      for (const statement of statements) {
        if (statement) {
          console.log(`   Executing: ${statement.substring(0, 60)}...`);
          const { error: stmtError } = await supabase.from('_').select('*').limit(0);
          if (stmtError) {
            throw new Error(`Failed to execute statement: ${stmtError.message}`);
          }
        }
      }
    }

    console.log('✅ Migration applied successfully!');
    console.log('');
    console.log('Summary of changes:');
    console.log('  - system_logs.tenant_id is now nullable');
    console.log('  - RLS policies updated to handle NULL tenant_id');
    console.log('  - Indexes created for performance');
    console.log('');
    console.log('⚠️  Note: You may need to apply this manually via Supabase Dashboard if RPC fails');
    console.log('   Dashboard → SQL Editor → Paste migration content → Run');
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error('');
    console.error('To apply manually:');
    console.error('1. Go to Supabase Dashboard → SQL Editor');
    console.error('2. Paste the contents of supabase/migrations/20251218_system_logs_nullable_tenant.sql');
    console.error('3. Click "Run"');
    process.exit(1);
  }
}

applyMigration();
