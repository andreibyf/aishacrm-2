// Check and clear production IP blocks and rate limits
// Usage: node backend/scripts/checkProductionBlocks.js [clear]
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const PROD_PROJECT_ID = 'ehjlenywplgyiahgxkfj';

async function main() {
  const shouldClear = process.argv[2] === 'clear';
  
  // Check if targeting production
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl?.includes(PROD_PROJECT_ID)) {
    console.log('⚠️ This script is for production only. Current SUPABASE_URL:', supabaseUrl);
    console.log('To check production, temporarily update .env with production credentials.');
    process.exit(1);
  }

  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').replace(/^-/, '');
  const client = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  console.log('🔍 Checking production security events...\n');

  // Check recent security events (last hour)
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { data: events, error: eventsError } = await client
    .from('system_logs')
    .select('*')
    .eq('level', 'security_alert')
    .gte('created_at', oneHourAgo)
    .order('created_at', { ascending: false })
    .limit(20);

  if (eventsError) {
    console.error('Error fetching security events:', eventsError);
  } else {
    console.log(`Found ${events?.length || 0} security events in last hour:`);
    events?.forEach(e => {
      console.log(`  [${e.created_at}] ${e.source}: ${e.message}`);
      console.log(`    IP: ${e.ip_address}, Violation: ${e.violation_type}`);
    });
  }

  // Note: In-memory rate limits are stored in backend server memory, not database
  // Redis-based IP blocks would be in Redis (if configured)
  console.log('\n📝 Notes:');
  console.log('  - In-memory rate limits clear when backend restarts');
  console.log('  - Redis IP blocks persist until expiration');
  console.log('  - Check backend logs for current rate limit status');
  
  if (shouldClear) {
    console.log('\n🧹 To clear blocks:');
    console.log('  1. Restart backend: docker-compose restart backend');
    console.log('  2. Or wait for rate limit window (60s default)');
    console.log('  3. For Redis blocks, use: redis-cli DEL blocked_ip:<IP>');
  }

  console.log('\n✅ Check complete');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
