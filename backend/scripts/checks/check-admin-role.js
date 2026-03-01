import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

const result = await pool.query(`
  SELECT id, email, role, status, created_at 
  FROM employees 
  WHERE email = 'admin@aishacrm.com'
`);

console.log('\n📋 Admin User Details:\n');
console.table(result.rows);

await pool.end();
