import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function checkOpportunityAccountRelationships() {
  try {
    console.log('🔍 Checking Opportunity-Account relationships...\n');

    // 1. Check table schema
    console.log('1️⃣  Checking opportunities table schema for account fields:');
    const schemaResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'opportunities' 
        AND (column_name LIKE '%account%' OR column_name = 'metadata')
      ORDER BY ordinal_position
    `);
    console.log(schemaResult.rows);
    console.log('');

    // 2. Check for opportunities with potential issues
    console.log('2️⃣  Checking for opportunities that might have account mismatches:');
    const mismatchCheck = await pool.query(`
      SELECT 
        o.id,
        o.name as opp_name,
        o.account_id,
        o.metadata->>'account_name' as metadata_account_name,
        a.name as actual_account_name
      FROM opportunities o
      LEFT JOIN accounts a ON o.account_id = a.id
      WHERE o.account_id IS NOT NULL
      LIMIT 20
    `);
    console.log(mismatchCheck.rows);
    console.log('');

    // 3. Check specifically for "Bone Dry" and "New Account"
    console.log('3️⃣  Looking for opportunities related to "Bone Dry" or "New Account":');
    const specificCheck = await pool.query(`
      SELECT 
        o.id,
        o.name as opp_name,
        o.account_id,
        o.metadata->>'account_name' as metadata_account_name,
        a.name as actual_account_name,
        o.metadata
      FROM opportunities o
      LEFT JOIN accounts a ON o.account_id = a.id
      WHERE 
        a.name ILIKE '%bone%dry%'
        OR a.name ILIKE '%new%account%'
        OR o.metadata->>'account_name' ILIKE '%bone%dry%'
        OR o.metadata->>'account_name' ILIKE '%new%account%'
    `);
    console.log(JSON.stringify(specificCheck.rows, null, 2));
    console.log('');

    // 4. Check accounts
    console.log('4️⃣  Looking for accounts named "Bone Dry" or "New Account":');
    const accountsCheck = await pool.query(`
      SELECT id, name, created_at
      FROM accounts
      WHERE name ILIKE '%bone%dry%' OR name ILIKE '%new%account%'
      ORDER BY created_at DESC
    `);
    console.log(accountsCheck.rows);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkOpportunityAccountRelationships();
