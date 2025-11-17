import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function checkAuthUsers() {
  console.log('\n=== Checking Supabase Auth Users ===\n');
  
  const { data, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('Error fetching auth users:', error);
    return;
  }
  
  console.log(`Found ${data.users.length} auth users:\n`);
  
  for (const user of data.users) {
    console.log(`Email: ${user.email}`);
    console.log(`  ID: ${user.id}`);
    console.log(`  Created: ${user.created_at}`);
    console.log(`  Confirmed: ${user.email_confirmed_at ? 'Yes' : 'No'}`);
    console.log(`  Metadata:`, user.user_metadata);
    console.log('');
  }
  
  // Check specifically for andrei.byfield@gmail.com
  const target = data.users.find(u => u.email === 'andrei.byfield@gmail.com');
  if (target) {
    console.log('⚠️  FOUND: andrei.byfield@gmail.com exists in Supabase Auth!');
    console.log('   This is likely causing the "User already exists" error.');
    console.log('   To delete this auth user, run:');
    console.log(`   node backend/delete-auth-user.js ${target.id}`);
  } else {
    console.log('✓ andrei.byfield@gmail.com NOT found in Supabase Auth');
  }
}

checkAuthUsers().catch(console.error);
