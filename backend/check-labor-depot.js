// Test script to check labor-depot account data structure
import dotenv from 'dotenv';
import { initSupabaseDB, getSupabaseClient } from './lib/supabase-db.js';

dotenv.config();

await initSupabaseDB();
const supa = getSupabaseClient();

async function checkLaborDepot() {
  console.log('\n🔍 Checking labor-depot accounts...\n');
  
  // Query accounts
  const { data: accounts, error } = await supa
    .from('accounts')
    .select('*')
    .eq('tenant_id', 'labor-depot')
    .limit(3);
  
  if (error) {
    console.error('❌ Error:', error);
    return;
  }
  
  console.log(`Found ${accounts.length} accounts for labor-depot\n`);
  
  if (accounts.length > 0) {
    console.log('Sample account structure:');
    console.log(JSON.stringify(accounts[0], null, 2));
    
    console.log('\n📊 Account fields:');
    console.log(Object.keys(accounts[0]).join(', '));
    
    // Check for revenue data
    console.log('\n💰 Revenue data:');
    accounts.forEach(acc => {
      console.log(`- ${acc.name}: annual_revenue=${acc.annual_revenue}, metadata=${JSON.stringify(acc.metadata)}`);
    });
  } else {
    console.log('⚠️  No accounts found for labor-depot');
  }
}

checkLaborDepot().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
