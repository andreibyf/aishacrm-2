import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './backend/.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkLeads() {
  console.log('Checking leads in database...\n');
  
  const { data: leads, error } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', 'local-tenant-001')
    .limit(5);
  
  if (error) {
    console.error('Error fetching leads:', error);
    return;
  }
  
  console.log(`Found ${leads.length} leads:\n`);
  
  leads.forEach((lead, i) => {
    console.log(`Lead ${i + 1}:`);
    console.log(`  Name: ${lead.first_name} ${lead.last_name}`);
    console.log(`  Status: "${lead.status}" (type: ${typeof lead.status})`);
    console.log(`  Created Date: ${lead.created_date}`);
    console.log(`  Is Test Data: ${lead.is_test_data}`);
    
    const createdDate = new Date(lead.created_date);
    const today = new Date();
    const ageInDays = Math.floor((today - createdDate) / (1000 * 60 * 60 * 24));
    console.log(`  Calculated Age: ${ageInDays} days`);
    console.log(`  Should show in Dashboard: ${!['converted', 'lost'].includes(lead.status)}`);
    console.log('');
  });
  
  // Test the filter that Dashboard uses
  const { data: activeLeads, error: filterError } = await supabase
    .from('leads')
    .select('*')
    .eq('tenant_id', 'local-tenant-001')
    .not('status', 'in', '("converted","lost")');
  
  if (filterError) {
    console.error('Error with filter:', filterError);
  } else {
    console.log(`\nDashboard filter found ${activeLeads.length} active leads`);
  }
}

checkLeads().catch(console.error);
