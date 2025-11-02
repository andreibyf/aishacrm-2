import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function checkBadLeadDates() {
  try {
    console.log('Checking for leads with bad dates...\n');
    
    // Find leads with NULL or very old dates
    const badDatesResult = await pgPool.query(`
      SELECT 
        id,
        first_name, 
        last_name, 
        email,
        created_date,
        created_at,
        status,
        tenant_id,
        EXTRACT(EPOCH FROM (now() - created_date)) / 86400 as age_in_days
      FROM leads
      WHERE created_date IS NULL 
         OR created_date < '2000-01-01'::timestamptz
      ORDER BY created_date ASC NULLS FIRST
      LIMIT 20
    `);
    
    console.log(`Found ${badDatesResult.rowCount} leads with bad dates:\n`);
    
    badDatesResult.rows.forEach((lead, i) => {
      console.log(`${i + 1}. ${lead.first_name} ${lead.last_name} (${lead.email})`);
      console.log(`   ID: ${lead.id}`);
      console.log(`   Tenant: ${lead.tenant_id}`);
      console.log(`   Status: ${lead.status}`);
      console.log(`   created_date: ${lead.created_date || 'NULL'}`);
      console.log(`   created_at: ${lead.created_at}`);
      console.log(`   Age in days: ${lead.age_in_days ? Math.floor(lead.age_in_days) : 'N/A'}`);
      console.log('');
    });
    
    // Count by tenant
    const countByTenant = await pgPool.query(`
      SELECT 
        tenant_id,
        COUNT(*) as bad_count
      FROM leads
      WHERE created_date IS NULL 
         OR created_date < '2000-01-01'::timestamptz
      GROUP BY tenant_id
      ORDER BY bad_count DESC
    `);
    
    console.log('Bad dates by tenant:');
    countByTenant.rows.forEach(row => {
      console.log(`  ${row.tenant_id}: ${row.bad_count} leads`);
    });
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error checking lead dates:', error);
    await pgPool.end();
    process.exit(1);
  }
}

checkBadLeadDates();
