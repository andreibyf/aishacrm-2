/**
 * Check if get_dashboard_bundle RPC exists and compare with dev
 * Usage: doppler run -- node check-dashboard-rpc.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function checkDashboardRPC() {
  try {
    console.log('\n🔍 CHECKING DASHBOARD RPC FUNCTIONS...\n');
    console.log(`   Connecting to: ${supabaseUrl}\n`);

    // Check if get_dashboard_bundle exists by querying pg_proc
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_dashboard_bundle', {
      p_tenant_id: '6cb4c008-4847-426a-9a2e-918ad70e7b69',
      p_include_test_data: true
    });

    if (rpcError) {
      if (rpcError.message.includes('function') && rpcError.message.includes('does not exist')) {
        console.log('❌ get_dashboard_bundle RPC does NOT exist!\n');
        console.log('   You need to apply the migration.\n');
      } else {
        console.log('❌ RPC error:', rpcError.message);
        console.log('   Code:', rpcError.code);
        console.log('   Details:', rpcError.details);
        console.log('   Hint:', rpcError.hint);
      }
    } else {
      console.log('✅ get_dashboard_bundle RPC EXISTS and is working!\n');
      console.log('   Result preview:');
      console.log(`   - Stats source: ${rpcData?.meta?.source || 'unknown'}`);
      console.log(`   - Generated at: ${rpcData?.meta?.generated_at || 'unknown'}`);
      console.log(`   - Total contacts: ${rpcData?.stats?.total_contacts || 0}`);
      console.log(`   - Total accounts: ${rpcData?.stats?.total_accounts || 0}`);
      console.log(`   - Total leads: ${rpcData?.stats?.total_leads || 0}`);
      console.log(`   - Recent activities: ${rpcData?.lists?.recentActivities?.length || 0}`);
    }

    console.log('\n' + '='.repeat(60) + '\n');

  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

checkDashboardRPC();
