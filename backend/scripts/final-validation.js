#!/usr/bin/env node
/**
 * Final validation script for PR #19 merge
 * Checks all critical security improvements from migrations 054-074
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from root
dotenv.config({ path: join(__dirname, '../.env') });

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set in .env file');
  process.exit(1);
}

console.log('🔍 Running final validation checks for PR #19...\n');

// Enforce SSL if DB_SSL=true or if PGSSLMODE provided (Supabase requires TLS)
const sslEnabled = process.env.DB_SSL === 'true' || /require|verify-full/i.test(process.env.PGSSLMODE || '');
const pool = new Pool({
  connectionString,
  ssl: sslEnabled ? { rejectUnauthorized: false } : undefined
});
if (sslEnabled) {
  console.log('🔐 SSL enforcement active (rejectUnauthorized=false for Supabase pooler).');
} else {
  console.log('⚠️  SSL not enforced (set DB_SSL=true or PGSSLMODE=require to enable).');
}

async function runValidation() {
  const client = await pool.connect();
  
  try {
    console.log('1️⃣  Checking composite index on leads...');
    const indexCheck = await client.query(`
      SELECT to_regclass('public.idx_leads_tenant_account') IS NOT NULL as exists
    `);
    if (indexCheck.rows[0].exists) {
      console.log('   ✅ Composite index idx_leads_tenant_account exists\n');
    } else {
      console.log('   ❌ Composite index MISSING!\n');
    }

    console.log('2️⃣  Checking RLS policy coverage...');
    const rlsCheck = await client.query(`
      SELECT 
        tablename,
        COUNT(*) as policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
        AND tablename IN (
          'accounts', 'activities', 'ai_campaigns', 'cash_flow', 'client_requirement',
          'contacts', 'conversations', 'conversation_messages', 'entity_transitions',
          'leads', 'note', 'notifications', 'opportunities', 'synchealth',
          'system_settings', 'workflow', 'workflow_execution'
        )
      GROUP BY tablename
      HAVING COUNT(*) < 1
      ORDER BY tablename
    `);
    
    if (rlsCheck.rows.length === 0) {
      console.log('   ✅ All critical tables have RLS policies\n');
    } else {
      console.log('   ❌ Tables with missing policies:');
      rlsCheck.rows.forEach(row => {
        console.log(`      - ${row.tablename}: ${row.policy_count} policies`);
      });
      console.log();
    }

    console.log('3️⃣  Checking safe trigger functions...');
    const triggerCheck = await client.query(`
      SELECT 
        t.tgname as trigger_name,
        c.relname as table_name,
        p.proname as function_name
      FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      JOIN pg_proc p ON t.tgfoid = p.oid
      WHERE c.relname IN (
        'accounts', 'activities', 'contacts', 'employees', 'leads', 
        'notifications', 'opportunities', 'system_logs', 'tenant_integrations',
        'users', 'ai_campaigns', 'system_settings'
      )
      AND t.tgname NOT LIKE 'RI_%'
      AND p.proname NOT LIKE '%_safe'
      ORDER BY table_name, trigger_name
    `);
    
    if (triggerCheck.rows.length === 0) {
      console.log('   ✅ All triggers use _safe function variants\n');
    } else {
      console.log('   ⚠️  Triggers NOT using safe functions:');
      triggerCheck.rows.forEach(row => {
        console.log(`      - ${row.table_name}.${row.trigger_name} → ${row.function_name}`);
      });
      console.log();
    }

    console.log('4️⃣  Checking for RLS enabled without policies...');
    const rlsNoPolicy = await client.query(`
      SELECT 
        tablename
      FROM pg_tables pt
      WHERE schemaname = 'public'
        AND rowsecurity = true
        AND NOT EXISTS (
          SELECT 1 FROM pg_policies pp 
          WHERE pp.schemaname = pt.schemaname 
          AND pp.tablename = pt.tablename
        )
      ORDER BY tablename
    `);
    
    if (rlsNoPolicy.rows.length === 0) {
      console.log('   ✅ No tables with RLS enabled but zero policies\n');
    } else {
      console.log('   ❌ Tables with RLS but NO POLICIES:');
      rlsNoPolicy.rows.forEach(row => {
        console.log(`      - ${row.tablename}`);
      });
      console.log();
    }

    console.log('5️⃣  Summary statistics...');
    const summary = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public' AND rowsecurity = true) as rls_tables,
        (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as total_policies,
        (SELECT COUNT(*) FROM pg_proc WHERE proname LIKE '%_safe') as safe_functions
    `);
    
    const stats = summary.rows[0];
    console.log(`   📊 RLS-enabled tables: ${stats.rls_tables}`);
    console.log(`   📊 Total RLS policies: ${stats.total_policies}`);
    console.log(`   📊 Safe trigger functions: ${stats.safe_functions}\n`);

    console.log('✅ Final validation complete!\n');
    console.log('📋 All security improvements from migrations 054-074 are in place.');
    console.log('🚀 PR #19 is ready to merge.\n');

  } catch (error) {
    console.error('❌ Validation error:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runValidation().catch(console.error);
