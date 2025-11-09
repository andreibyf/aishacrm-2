#!/usr/bin/env node
/**
 * Apply migration 031: Rename cash_flow.type to transaction_type
 */

import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Supabase Cloud connection - use direct connection string to bypass RLS
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:W2bDzSuJ3gLqBLhs@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('🔗 Connecting to database...');
    
    const migrationFile = path.join(__dirname, 'migrations', '031_rename_cash_flow_type_to_transaction_type.sql');
    const sql = fs.readFileSync(migrationFile, 'utf8');
    
    console.log('📄 Applying migration 031...');
    await pool.query(sql);
    
    console.log('✅ Migration applied successfully!');
    console.log('   Column cash_flow.type renamed to transaction_type');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.message.includes('does not exist')) {
      console.log('   Note: Column may already be renamed or table structure is different');
    }
  } finally {
    await pool.end();
  }
}

runMigration();
