import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function checkLeadsAfterFix() {
  try {
    console.log('\n📊 Checking leads created_date after migration fix...\n');
    
    const result = await pgPool.query(`
      SELECT 
        first_name, 
        last_name, 
        email,
        created_at,
        created_date,
        EXTRACT(EPOCH FROM (now() - created_date)) / 86400 as age_days
      FROM leads
      WHERE tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69'
      ORDER BY created_date DESC
      LIMIT 10
    `);
    
    console.log(`Found ${result.rowCount} leads:\n`);
    
    result.rows.forEach((lead, i) => {
      const age = Math.floor(lead.age_days);
      console.log(`${i + 1}. ${lead.first_name} ${lead.last_name} (${lead.email})`);
      console.log(`   created_at: ${lead.created_at}`);
      console.log(`   created_date: ${lead.created_date}`);
      console.log(`   Age: ${age} days`);
      console.log('');
    });
    
    // Check if any leads still have bad dates
    const badDatesCheck = await pgPool.query(`
      SELECT COUNT(*) as bad_count
      FROM leads
      WHERE created_date IS NULL OR created_date < '2000-01-01'::timestamptz
    `);
    
    console.log(`\n✅ Leads with bad dates remaining: ${badDatesCheck.rows[0].bad_count}`);
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    await pgPool.end();
    process.exit(1);
  }
}

checkLeadsAfterFix();
