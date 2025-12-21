import pkg from 'pg';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';

const { Pool } = pkg;
dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

console.log('\n🔧 Running SQL migration...\n');

async function runMigration() {
  const client = await pool.connect();
  
  try {
    const sql = readFileSync('./migrations/030_update_port_references.sql', 'utf8');
    console.log('Executing SQL:', sql);
    
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('COMMIT');
    
    console.log('\n✅ Migration completed successfully!\n');
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error running migration:', err);
    throw err;
  } finally {
    client.release();
    pool.end();
  }
}

runMigration().catch(console.error);