import pg from 'pg';
import dotenv from 'dotenv';
import dns from 'dns';

dotenv.config({ path: './.env' });
dns.setDefaultResultOrder('ipv4first');

// Try DIRECT connection instead of pooler
// Replace pooler.supabase.com with direct db host
const directHost = process.env.SUPABASE_DB_HOST.replace('pooler.supabase.com', 'supabase.com');
const directPort = 5432; // Direct connection uses standard PostgreSQL port

const pool = new pg.Pool({
  host: directHost,
  port: directPort,
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

console.log('Testing DIRECT connection (bypassing pooler) to:', {
  host: directHost,
  port: directPort,
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
});

try {
  console.log('\n1. Testing simple query...');
  const result1 = await pool.query('SELECT 1 as test');
  console.log('✓ Simple query works:', result1.rows);

  console.log('\n2. Testing users table query...');
  const result2 = await pool.query(
    "SELECT email, role FROM users WHERE email = $1",
    ['abyfield@4vdataconsulting.com']
  );
  console.log('✓ Users query works:', result2.rows);

  console.log('\n✅ Direct connection works! Update .env to use direct connection.');
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('Error code:', error.code);
  console.error('Full error:', error);
} finally {
  await pool.end();
}
