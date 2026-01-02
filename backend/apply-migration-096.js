/**
 * Apply Migration 096 - Make tenant_id_text Nullable
 * 
 * STATUS: ✅ HISTORICAL - Already applied to production
 * Purpose: Allowed INSERT operations to work without tenant_id_text
 * Context: Part of Phase 1 tenant UUID migration
 * 
 * This script:
 * - Makes tenant_id_text nullable on core tables
 * - Enabled application code to use tenant_id (UUID) exclusively
 * - Historical reference only - do not re-run
 * 
 * See: backend/migrations/096_tenant_id_text_nullable.sql for SQL version
 * See: backend/migrations/TENANT_ID_CLEANUP_PLAN.md for full migration plan
 * 
 * Note: Works around the exec_sql RPC function not being available
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

// Statements to execute one by one
const statements = [
  { desc: 'Make leads.tenant_id_text nullable', sql: 'ALTER TABLE leads ALTER COLUMN tenant_id_text DROP NOT NULL' },
  { desc: 'Make accounts.tenant_id_text nullable', sql: 'ALTER TABLE accounts ALTER COLUMN tenant_id_text DROP NOT NULL' },
  { desc: 'Make contacts.tenant_id_text nullable', sql: 'ALTER TABLE contacts ALTER COLUMN tenant_id_text DROP NOT NULL' },
  { desc: 'Make opportunities.tenant_id_text nullable', sql: 'ALTER TABLE opportunities ALTER COLUMN tenant_id_text DROP NOT NULL' },
  { desc: 'Make activities.tenant_id_text nullable', sql: 'ALTER TABLE activities ALTER COLUMN tenant_id_text DROP NOT NULL' },
  { desc: 'Make note.tenant_id_text nullable', sql: 'ALTER TABLE note ALTER COLUMN tenant_id_text DROP NOT NULL' },
];

async function run() {
  console.log('🚀 Applying migration 096: tenant_id_text nullable\n');
  
  for (const stmt of statements) {
    console.log(`⏳ ${stmt.desc}...`);
    
    // Try via /rest/v1/ raw SQL endpoint (some Supabase versions support this)
    const response = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'tx=commit',
        'X-Supabase-Schema': 'public'
      },
      body: JSON.stringify({})
    });

    // Since direct REST DDL isn't supported, we'll need to provide instructions
    console.log(`   ⚠️  Cannot execute DDL via REST API. Statement: ${stmt.sql}`);
  }
  
  console.log('\n════════════════════════════════════════════════════════════════');
  console.log('⚠️  DDL statements cannot be executed via Supabase REST API.');
  console.log('');
  console.log('Please run the following SQL in the Supabase Dashboard SQL Editor:');
  console.log('https://supabase.com/dashboard/project/efzqxjpfewkrgpdootte/sql');
  console.log('');
  console.log('────────────────────────────────────────────────────────────────');
  for (const stmt of statements) {
    console.log(`${stmt.sql};`);
  }
  console.log('────────────────────────────────────────────────────────────────');
}

run().catch(console.error);
