import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const { data, error, count } = await supabase
  .from('dashboard_funnel_counts')
  .select('tenant_id,sources_total,leads_total,contacts_total,accounts_total', { count: 'exact' })
  .limit(5);

console.log('Error:', error);
console.log('Row count:', count);
console.log('Sample data:', JSON.stringify(data, null, 2));

// Also check if view needs refresh
const { data: refreshData, error: refreshError } = await supabase.rpc('refresh_dashboard_funnel_counts');
console.log('\nRefresh called:', refreshError ? 'Error: ' + refreshError.message : 'Success');
