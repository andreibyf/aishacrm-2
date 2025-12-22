import pkg from 'pg';
import dotenv from 'dotenv';
dotenv.config({ path: './backend/.env' });
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
const { Client } = pkg;
const client = new Client({ 
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});
async function run() {
  await client.connect();
  const res = await client.query('SELECT tenant_id FROM tenant LIMIT 10');
  console.log('TENANTS:', JSON.stringify(res.rows));
  await client.end();
}
run().catch(console.error);
