import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function checkDataCounts() {
  try {
    // Get all tenants
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenant')
      .select('tenant_id, name');

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      return;
    }

    console.log('\n📊 Database Data Counts\n');
    console.log('Tenants found:', tenants.length);
    console.log('---');

    for (const tenant of tenants) {
      console.log(`\n${tenant.name} (${tenant.tenant_id}):`);

      const { count: leadsCount } = await supabase
        .from('leads')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.tenant_id);

      const { count: contactsCount } = await supabase
        .from('contacts')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.tenant_id);

      const { count: accountsCount } = await supabase
        .from('accounts')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.tenant_id);

      const { count: oppsCount } = await supabase
        .from('opportunities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.tenant_id);

      const { count: activitiesCount } = await supabase
        .from('activities')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.tenant_id);

      console.log(`  Leads: ${leadsCount}`);
      console.log(`  Contacts: ${contactsCount}`);
      console.log(`  Accounts: ${accountsCount}`);
      console.log(`  Opportunities: ${oppsCount}`);
      console.log(`  Activities: ${activitiesCount}`);
    }

    console.log('\n---\n');
  } catch (error) {
    console.error('Error:', error);
  }
}

checkDataCounts();
