import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const client = new pg.Client({
  connectionString: process.env.DATABASE_URL
});

async function checkUsers() {
  try {
    await client.connect();
    
    console.log('\n=== USERS TABLE ===');
    const users = await client.query(`
      SELECT id, email, role, tenant_id, 
             metadata->>'tenant_id' as metadata_tenant_id,
             created_at 
      FROM users 
      WHERE email NOT LIKE '%audit.test%' 
        AND email NOT LIKE '%e2e.temp%'
        AND email NOT LIKE '%@example.com'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.table(users.rows);
    
    console.log('\n=== EMPLOYEES TABLE ===');
    const employees = await client.query(`
      SELECT id, email, role, tenant_id, status, created_at 
      FROM employees 
      WHERE email NOT LIKE '%audit.test%' 
        AND email NOT LIKE '%e2e.temp%'
        AND email NOT LIKE '%@example.com'
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.table(employees.rows);
    
    console.log('\n=== TENANTS TABLE ===');
    const tenants = await client.query(`
      SELECT id, name, status, domain, industry, created_at 
      FROM tenant 
      ORDER BY created_at DESC 
      LIMIT 10
    `);
    console.table(tenants.rows);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkUsers();
