import pg from 'pg';

const pool = new pg.Pool({
  connectionString: 'postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres'
});

async function checkTenants() {
  try {
    console.log('Checking tenant table...\n');
    
    const result = await pool.query('SELECT id, tenant_id, name, status, country, major_city, industry FROM tenant ORDER BY created_at DESC');
    
    console.log(`Found ${result.rows.length} tenant(s):\n`);
    result.rows.forEach((tenant, i) => {
      console.log(`${i + 1}. ${tenant.name}`);
      console.log(`   ID: ${tenant.id}`);
      console.log(`   Tenant ID: ${tenant.tenant_id}`);
      console.log(`   Status: ${tenant.status}`);
      console.log(`   Country: ${tenant.country || 'N/A'}`);
      console.log(`   City: ${tenant.major_city || 'N/A'}`);
      console.log(`   Industry: ${tenant.industry || 'N/A'}`);
      console.log('');
    });
    
    await pool.end();
  } catch (error) {
    console.error('Error:', error.message);
    await pool.end();
    process.exit(1);
  }
}

checkTenants();
