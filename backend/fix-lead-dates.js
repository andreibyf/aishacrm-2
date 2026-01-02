import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('supabase') ? { rejectUnauthorized: false } : false,
});

async function fixLeadDates() {
  try {
    console.log('Fixing lead created_date values...');
    
    // Update leads where created_date is NULL or from epoch (1970)
    const updateResult = await pgPool.query(`
      UPDATE leads 
      SET created_date = COALESCE(created_at, now()) 
      WHERE created_date IS NULL 
         OR created_date < '2000-01-01'::timestamptz
    `);
    
    console.log(`Updated ${updateResult.rowCount} leads`);
    
    // Show sample of fixed leads
    const sampleResult = await pgPool.query(`
      SELECT first_name, last_name, created_date, status
      FROM leads
      WHERE tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69'
      ORDER BY created_date DESC
      LIMIT 5
    `);
    
    console.log('\nSample leads after fix:');
    sampleResult.rows.forEach(lead => {
      console.log(`  ${lead.first_name} ${lead.last_name} - ${lead.created_date} - ${lead.status}`);
    });
    
    await pgPool.end();
    process.exit(0);
  } catch (error) {
    console.error('Error fixing lead dates:', error);
    await pgPool.end();
    process.exit(1);
  }
}

fixLeadDates();
