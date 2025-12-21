import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config({ path: './.env' });
dns.setDefaultResultOrder('ipv4first');

const pool = new pg.Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: parseInt(process.env.SUPABASE_DB_PORT),
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false },
  // Add application_name to help debug
  application_name: 'test-connection',
  // Try setting search_path on connect
  options: '-c search_path=public'
});

console.log('Testing connection WITH search_path to:', {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT,
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  options: '-c search_path=public'
});

try {
  console.log('\n1. Testing simple query...');
  const result1 = await pool.query('SELECT 1 as test');
  console.log('✓ Simple query works:', result1.rows);

  console.log('\n2. Checking current search_path...');
  const result2 = await pool.query('SHOW search_path');
  console.log('✓ Search path:', result2.rows);

  console.log('\n3. Testing users table query...');
  const result3 = await pool.query(
    "SELECT email, role FROM users WHERE email = $1",
    ['abyfield@4vdataconsulting.com']
  );
  console.log('✓ Users query works:', result3.rows);

  console.log('\n✅ Connection with search_path works!');
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('Error code:', error.code);
  console.error('Full error:', error);
} finally {
  await pool.end();
}
