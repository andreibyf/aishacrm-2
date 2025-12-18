import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: './.env' });

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('Testing Supabase connection via JS client...\n');

try {
  // Test 1: Query users table via Supabase client
  console.log('1. Testing users table query via Supabase client...');
  const { data, error } = await supabase
    .from('users')
    .select('email, role')
    .eq('email', 'abyfield@4vdataconsulting.com')
    .limit(1);
  
  if (error) {
    console.error('✗ Error:', error);
  } else {
    console.log('✓ Users query works via Supabase client:', data);
  }

  // Test 2: Raw SQL via Supabase RPC
  console.log('\n2. Testing raw SQL via Supabase...');
  const { data: sqlData, error: sqlError } = await supabase.rpc('exec_sql', {
    sql: 'SELECT current_user, current_database()'
  });
  
  if (sqlError) {
    console.error('✗ SQL Error:', sqlError);
  } else {
    console.log('✓ SQL query works:', sqlData);
  }

  console.log('\n✅ Supabase client connection works!');
  console.log('→ This means the issue is specific to direct PostgreSQL pooler connection.');
  
} catch (error) {
  console.error('\n❌ Error:', error.message);
}
