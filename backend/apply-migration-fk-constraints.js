/**
 * Apply Foreign Key Constraints Migration
 * Uses Supabase API to add FK constraints for V2 API denormalized fields
 * 
 * Run with: doppler run -- node backend/apply-migration-fk-constraints.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
});

/**
 * Execute a single SQL statement via Supabase REST API
 * Note: DDL statements (CREATE, ALTER, DROP) cannot be run via REST API.
 * This provides instructions for manual execution via SQL Editor.
 */
async function executeSql(description, sql) {
  console.log(`\n⏳ ${description}`);
  console.log(`   SQL: ${sql.substring(0, 80)}...`);
  
  // Since Supabase REST API doesn't support DDL, we collect statements for manual execution
  return sql;
}

async function applyMigration() {
  console.log('🚀 FK Constraints Migration Runner\n');
  console.log('Note: DDL statements must be executed via Supabase SQL Editor');
  console.log('═'.repeat(70));

  const statements = [
    // ============================================================
    // LEADS TABLE - assigned_to
    // ============================================================
    `ALTER TABLE leads ADD COLUMN IF NOT EXISTS assigned_to UUID;`,
    `ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_assigned_to_fkey;`,
    `ALTER TABLE leads ADD CONSTRAINT leads_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;`,

    // ============================================================
    // CONTACTS TABLE - assigned_to
    // ============================================================
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS assigned_to UUID;`,
    `ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_assigned_to_fkey;`,
    `ALTER TABLE contacts ADD CONSTRAINT contacts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;`,

    // ============================================================
    // CONTACTS TABLE - account_id
    // ============================================================
    `ALTER TABLE contacts ADD COLUMN IF NOT EXISTS account_id UUID;`,
    `ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_account_id_fkey;`,
    `ALTER TABLE contacts ADD CONSTRAINT contacts_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;`,

    // ============================================================
    // OPPORTUNITIES TABLE - assigned_to
    // ============================================================
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS assigned_to UUID;`,
    `ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_assigned_to_fkey;`,
    `ALTER TABLE opportunities ADD CONSTRAINT opportunities_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;`,

    // ============================================================
    // OPPORTUNITIES TABLE - account_id
    // ============================================================
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS account_id UUID;`,
    `ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_account_id_fkey;`,
    `ALTER TABLE opportunities ADD CONSTRAINT opportunities_account_id_fkey FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL;`,

    // ============================================================
    // OPPORTUNITIES TABLE - contact_id
    // ============================================================
    `ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS contact_id UUID;`,
    `ALTER TABLE opportunities DROP CONSTRAINT IF EXISTS opportunities_contact_id_fkey;`,
    `ALTER TABLE opportunities ADD CONSTRAINT opportunities_contact_id_fkey FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL;`,

    // ============================================================
    // ACTIVITIES TABLE - assigned_to
    // ============================================================
    `ALTER TABLE activities ADD COLUMN IF NOT EXISTS assigned_to UUID;`,
    `ALTER TABLE activities DROP CONSTRAINT IF EXISTS activities_assigned_to_fkey;`,
    `ALTER TABLE activities ADD CONSTRAINT activities_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;`,

    // ============================================================
    // ACCOUNTS TABLE - assigned_to
    // ============================================================
    `ALTER TABLE accounts ADD COLUMN IF NOT EXISTS assigned_to UUID;`,
    `ALTER TABLE accounts DROP CONSTRAINT IF EXISTS accounts_assigned_to_fkey;`,
    `ALTER TABLE accounts ADD CONSTRAINT accounts_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES employees(id) ON DELETE SET NULL;`,

    // ============================================================
    // Create indexes for FK columns
    // ============================================================
    `CREATE INDEX IF NOT EXISTS idx_leads_assigned_to ON leads(assigned_to);`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_assigned_to ON contacts(assigned_to);`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_account_id ON contacts(account_id);`,
    `CREATE INDEX IF NOT EXISTS idx_opportunities_assigned_to ON opportunities(assigned_to);`,
    `CREATE INDEX IF NOT EXISTS idx_opportunities_account_id ON opportunities(account_id);`,
    `CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id ON opportunities(contact_id);`,
    `CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON activities(assigned_to);`,
    `CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to ON accounts(assigned_to);`
  ];

  const sqlStatements = [];
  
  for (const stmt of statements) {
    const sql = await executeSql('Processing statement', stmt);
    sqlStatements.push(sql);
  }

  console.log('\n═'.repeat(70));
  console.log('\n⚠️  DDL statements cannot be executed via Supabase REST API.');
  console.log('\n📋 INSTRUCTIONS:');
  console.log('1. Go to Supabase Dashboard: https://supabase.com/dashboard');
  console.log('2. Select your project (aishacrm)');
  console.log('3. Open SQL Editor');
  console.log('4. Copy and paste the SQL below');
  console.log('5. Click "Run"\n');
  console.log('────────────────────────────────────────────────────────────────');
  
  console.log('\n-- FK Constraints Migration\n');
  sqlStatements.forEach((sql, idx) => {
    console.log(`${sql}`);
  });
  
  console.log('\n────────────────────────────────────────────────────────────────');
  console.log('\n✅ SQL prepared for manual execution in Supabase SQL Editor');
  console.log('\nAlternatively, run this command in your PostgreSQL client:');
  console.log(`  psql "${SUPABASE_URL.replace('https://', 'postgresql://postgres:PASSWORD@').replace('.co', '.co:5432')}?sslmode=require" < supabase/migrations/20251218_add_fk_constraints.sql\n`);
}

applyMigration().catch(err => {
  console.error('❌ Migration error:', err.message);
  process.exit(1);
});
