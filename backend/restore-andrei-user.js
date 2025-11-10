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

async function restoreUser() {
  console.log('🔧 Restoring andrei.byfield@gmail.com...\n');

  const email = 'andrei.byfield@gmail.com';
  const password = 'TempPassword123!'; // You'll need to reset this

  try {
    // Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        full_name: 'Andrei Byfield'
      }
    });

    if (authError) {
      console.error('❌ Failed to create auth user:', authError);
      return;
    }

    console.log('✅ Created auth user:');
    console.log(`   Email: ${authUser.user.email}`);
    console.log(`   ID: ${authUser.user.id}`);
    console.log(`   Password: ${password} (TEMPORARY - please reset)`);

    // Update the users table to link to new auth ID
    const { error: updateError } = await supabase
      .from('users')
      .update({ id: authUser.user.id })
      .eq('email', email);

    if (updateError) {
      console.warn('\n⚠️  Could not update users table:', updateError.message);
      console.log('   The old users table record still exists with old ID');
      console.log('   You may need to manually fix this or delete and recreate');
    } else {
      console.log('✅ Updated users table with new auth ID');
    }

    console.log('\n🎉 User restored successfully!');
    console.log('\n⚠️  IMPORTANT: Login with:');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${password}`);
    console.log('\n   Then immediately change your password in Settings!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

restoreUser();
