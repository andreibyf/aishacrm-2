import dotenv from 'dotenv';
import { Pool } from 'pg';

dotenv.config({ path: '.env' });

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkRLS() {
  const client = await pool.connect();
  try {
    console.log('Checking RLS status for all tables...\n');

    const result = await client.query(`
      SELECT schemaname, tablename, rowsecurity as rls_enabled
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);

    console.log('Tables with RLS status:');
    result.rows.forEach(row => {
      console.log(`${row.tablename}: ${row.rowsecurity ? 'ENABLED' : 'DISABLED'}`);
    });

    console.log('\nChecking existing policies...');
    const policiesResult = await client.query(`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
      ORDER BY tablename, policyname
    `);

    console.log('Existing policies:');
    policiesResult.rows.forEach(row => {
      console.log(`${row.tablename}: ${row.policyname}`);
    });

  } finally {
    client.release();
    await pool.end();
  }
}

checkRLS().catch(console.error);