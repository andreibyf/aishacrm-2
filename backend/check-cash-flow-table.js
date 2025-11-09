#!/usr/bin/env node
/**
 * Check cash_flow table structure
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres:W2bDzSuJ3gLqBLhs@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function checkTable() {
  try {
    console.log('🔗 Connecting to database...');
    
    // Check column names
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'cash_flow'
      AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);
    
    console.log('\n📋 cash_flow table structure:');
    console.log('Column Name'.padEnd(25), 'Data Type'.padEnd(20), 'Nullable');
    console.log('─'.repeat(70));
    
    result.rows.forEach(row => {
      console.log(
        row.column_name.padEnd(25),
        row.data_type.padEnd(20),
        row.is_nullable
      );
    });
    
    const hasType = result.rows.some(r => r.column_name === 'type');
    const hasTransactionType = result.rows.some(r => r.column_name === 'transaction_type');
    
    console.log('\n🔍 Analysis:');
    if (hasType && !hasTransactionType) {
      console.log('   ✅ Column "type" exists - needs to be renamed');
      console.log('   📝 Run: ALTER TABLE cash_flow RENAME COLUMN type TO transaction_type;');
    } else if (!hasType && hasTransactionType) {
      console.log('   ✅ Column "transaction_type" already exists - migration already applied!');
    } else if (hasType && hasTransactionType) {
      console.log('   ⚠️  Both columns exist - unusual state');
    } else {
      console.log('   ❌ Neither column exists - check table structure');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTable();
