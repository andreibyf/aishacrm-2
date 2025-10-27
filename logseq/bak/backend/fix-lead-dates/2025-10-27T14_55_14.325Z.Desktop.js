import { pgPool } from './server.js';

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
      WHERE tenant_id = 'local-tenant-001'
      LIMIT 5
    `);
    
    console.log('\nSample leads after fix:');
    sampleResult.rows.forEach(lead => {
      console.log(`  ${lead.first_name} ${lead.last_name} - ${lead.created_date} - ${lead.status}`);
    });
    
    process.exit(0);
  } catch (error) {
    console.error('Error fixing lead dates:', error);
    process.exit(1);
  }
}

fixLeadDates();
