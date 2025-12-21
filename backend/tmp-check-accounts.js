import { initSupabaseDB, getSupabaseClient } from './lib/supabase-db.js';

async function run() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env');
    process.exit(1);
  }

  initSupabaseDB(url, key);
  const supa = getSupabaseClient();

  const { data: accounts, error } = await supa
    .from('accounts')
    .select('*')
    .eq('tenant_id', 'labor-depot');

  if (error) {
    console.error('Error querying accounts:', error);
    process.exit(1);
  }

  console.log(`Found ${accounts.length} accounts for labor-depot`);
  console.log(JSON.stringify(accounts, null, 2));
}

run().catch(err => { console.error(err); process.exit(1); });
