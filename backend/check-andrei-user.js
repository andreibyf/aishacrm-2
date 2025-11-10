import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkUser() {
  console.log('🔍 Checking for andrei.byfield@gmail.com...\n');

  // Check Supabase Auth
  const { data: authData } = await supabase.auth.admin.listUsers();
  const authUser = authData.users.find(u => u.email === 'andrei.byfield@gmail.com');
  
  console.log('📧 Supabase Auth:');
  if (authUser) {
    console.log(`  ✅ Found: ${authUser.email}`);
    console.log(`     ID: ${authUser.id}`);
    console.log(`     Created: ${authUser.created_at}`);
    console.log(`     Confirmed: ${authUser.email_confirmed_at ? 'Yes' : 'No'}`);
  } else {
    console.log(`  ❌ NOT FOUND in auth.users`);
  }

  // Check users table
  const { data: userData } = await supabase
    .from('users')
    .select('*')
    .eq('email', 'andrei.byfield@gmail.com');

  console.log('\n📊 Users table:');
  if (userData && userData.length > 0) {
    console.log(`  ✅ Found: ${userData[0].email}`);
    console.log(`     ID: ${userData[0].id}`);
    console.log(`     Role: ${userData[0].role}`);
  } else {
    console.log(`  ❌ NOT FOUND in users table`);
  }

  // Check employees table
  const { data: empData } = await supabase
    .from('employees')
    .select('*')
    .eq('email', 'andrei.byfield@gmail.com');

  console.log('\n👥 Employees table:');
  if (empData && empData.length > 0) {
    console.log(`  ✅ Found: ${empData[0].email}`);
    console.log(`     ID: ${empData[0].id}`);
  } else {
    console.log(`  ❌ NOT FOUND in employees table`);
  }

  console.log('\n💡 Summary:');
  if (!authUser) {
    console.log('⚠️  User deleted from Supabase Auth - cannot login');
    console.log('   Need to recreate the auth user');
  } else if (!userData || userData.length === 0) {
    console.log('⚠️  Auth exists but no users table record');
    console.log('   Need to create users table entry');
  } else {
    console.log('✅ User exists and should be able to login');
  }
}

checkUser();
