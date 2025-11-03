import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

const pool = new pg.Pool({
  host: process.env.SUPABASE_DB_HOST,
  port: parseInt(process.env.SUPABASE_DB_PORT),
  database: process.env.SUPABASE_DB_NAME,
  user: process.env.SUPABASE_DB_USER,
  password: process.env.SUPABASE_DB_PASSWORD,
  ssl: { rejectUnauthorized: false }
});

console.log('Testing connection to:', {
  host: process.env.SUPABASE_DB_HOST,
  port: process.env.SUPABASE_DB_PORT,
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

  console.log('\n3. Testing employees table query...');
  const result3 = await pool.query(
    "SELECT email FROM employees LIMIT 1"
  );
  console.log('✓ Employees query works:', result3.rows);

  console.log('\n✅ All tests passed!');
} catch (error) {
  console.error('\n❌ Error:', error.message);
  console.error('Error code:', error.code);
  console.error('Error detail:', error.detail);
  console.error('Full error:', error);
} finally {
  await pool.end();
}
