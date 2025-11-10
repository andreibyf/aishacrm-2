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

async function listAllUsers() {
  console.log('🔍 Querying users table...\n');

  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('❌ Error:', error);
    return;
  }

  console.log(`Found ${data.length} users in users table:\n`);
  
  if (data.length === 0) {
    console.log('  (empty)');
  } else {
    data.forEach((user, i) => {
      console.log(`${i + 1}. ${user.email || 'NO EMAIL'}`);
      console.log(`   ID: ${user.id}`);
      console.log(`   Name: ${user.full_name || 'N/A'}`);
      console.log(`   Role: ${user.role || 'N/A'}`);
      console.log(`   Created: ${user.created_at}`);
      console.log('');
    });
  }

  console.log('\n🔍 Querying employees table...\n');

  const { data: empData, error: empError } = await supabase
    .from('employees')
    .select('*')
    .order('created_at', { ascending: false });

  if (empError) {
    console.error('❌ Error:', empError);
    return;
  }

  console.log(`Found ${empData.length} employees in employees table:\n`);
  
  if (empData.length === 0) {
    console.log('  (empty)');
  } else {
    empData.forEach((emp, i) => {
      console.log(`${i + 1}. ${emp.email || 'NO EMAIL'}`);
      console.log(`   ID: ${emp.id}`);
      console.log(`   Name: ${emp.full_name || 'N/A'}`);
      console.log(`   Tenant: ${emp.tenant_id || 'N/A'}`);
      console.log(`   Created: ${emp.created_at}`);
      console.log('');
    });
  }
}

listAllUsers();
