import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in backend/.env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function deleteUnknownUsers() {
  console.log('🔍 Fetching all auth users...\n');

  // Get all auth users
  const { data: authUsers, error } = await supabase.auth.admin.listUsers();
  
  if (error) {
    console.error('❌ Error fetching users:', error);
    process.exit(1);
  }

  console.log(`Found ${authUsers.users.length} total auth users\n`);

  // Protected emails
  const protectedEmails = [
    'abyfield@4vdataconsulting.com',
    'andrei.byfield@gmail.com'
  ];

  // Find users to delete (those with email containing @)
  const usersToDelete = authUsers.users.filter(user => {
    const email = user.email;
    if (!email) return false;
    if (protectedEmails.includes(email)) return false;
    return true;
  });

  console.log(`📋 Found ${usersToDelete.length} users to potentially delete:\n`);
  usersToDelete.forEach((user, i) => {
    console.log(`${i + 1}. ${user.email} (ID: ${user.id})`);
  });

  if (usersToDelete.length === 0) {
    console.log('\n✅ No users to delete!');
    return;
  }

  console.log('\n⚠️  Deleting users in 5 seconds... Press Ctrl+C to cancel\n');
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🗑️  Starting deletion...\n');

  let successCount = 0;
  let failCount = 0;

  for (const user of usersToDelete) {
    try {
      const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
      
      if (deleteError) {
        console.error(`❌ Failed to delete ${user.email}: ${deleteError.message}`);
        failCount++;
      } else {
        console.log(`✅ Deleted ${user.email}`);
        successCount++;
      }

      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 100));
    } catch (err) {
      console.error(`❌ Error deleting ${user.email}:`, err.message);
      failCount++;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`✅ Successfully deleted: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📝 Total processed: ${usersToDelete.length}`);
}

deleteUnknownUsers().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
