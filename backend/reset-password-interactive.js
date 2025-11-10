import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import readline from 'readline';

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

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function resetPassword() {
  const email = 'andrei.byfield@gmail.com';
  
  console.log(`🔐 Password Reset for: ${email}\n`);
  
  const newPassword = await question('Enter new password: ');
  
  if (!newPassword || newPassword.length < 6) {
    console.log('❌ Password must be at least 6 characters');
    rl.close();
    return;
  }

  try {
    // Get user by email
    const { data: authData } = await supabase.auth.admin.listUsers();
    const user = authData.users.find(u => u.email === email);

    if (!user) {
      console.log('❌ User not found');
      rl.close();
      return;
    }

    // Update password
    const { error } = await supabase.auth.admin.updateUserById(
      user.id,
      { password: newPassword }
    );

    if (error) {
      console.error('❌ Failed to update password:', error);
    } else {
      console.log('\n✅ Password updated successfully!');
      console.log(`\n🎉 You can now login with:`);
      console.log(`   Email: ${email}`);
      console.log(`   Password: ${newPassword}`);
    }
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    rl.close();
  }
}

resetPassword();
