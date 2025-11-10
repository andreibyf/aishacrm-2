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

async function checkAndCleanOrphanedUsers() {
  console.log('🔍 Checking for orphaned users in database tables...\n');

  try {
    // Get all auth users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authEmails = new Set(authData.users.map(u => u.email));

    console.log(`Found ${authEmails.size} users in Supabase Auth:`);
    authData.users.forEach(u => console.log(`  - ${u.email}`));
    console.log('');

    // Check users table
    const { data: usersData } = await supabase.from('users').select('id, email, full_name, role');
    console.log(`📊 Users table: ${usersData?.length || 0} records`);
    
    const orphanedUsers = (usersData || []).filter(u => !authEmails.has(u.email));
    if (orphanedUsers.length > 0) {
      console.log(`\n⚠️  Found ${orphanedUsers.length} orphaned users (in users table but not in auth):`);
      orphanedUsers.forEach((u, i) => {
        console.log(`${i + 1}. ${u.email} (${u.full_name || 'No name'}) - Role: ${u.role}`);
      });

      console.log('\n🗑️  Deleting orphaned users from users table...');
      for (const user of orphanedUsers) {
        const { error } = await supabase.from('users').delete().eq('id', user.id);
        if (error) {
          console.error(`  ❌ Failed to delete ${user.email}:`, error.message);
        } else {
          console.log(`  ✅ Deleted ${user.email}`);
        }
      }
    } else {
      console.log('  ✅ No orphaned users');
    }

    // Check employees table
    const { data: employeesData } = await supabase.from('employees').select('id, email, full_name, tenant_id');
    console.log(`\n📊 Employees table: ${employeesData?.length || 0} records`);
    
    const orphanedEmployees = (employeesData || []).filter(e => !authEmails.has(e.email));
    if (orphanedEmployees.length > 0) {
      console.log(`\n⚠️  Found ${orphanedEmployees.length} orphaned employees (in employees table but not in auth):`);
      orphanedEmployees.forEach((e, i) => {
        console.log(`${i + 1}. ${e.email} (${e.full_name || 'No name'}) - Tenant: ${e.tenant_id}`);
      });

      console.log('\n🗑️  Deleting orphaned employees from employees table...');
      for (const emp of orphanedEmployees) {
        const { error } = await supabase.from('employees').delete().eq('id', emp.id);
        if (error) {
          console.error(`  ❌ Failed to delete ${emp.email}:`, error.message);
        } else {
          console.log(`  ✅ Deleted ${emp.email}`);
        }
      }
    } else {
      console.log('  ✅ No orphaned employees');
    }

    console.log('\n✨ Cleanup complete!');

  } catch (error) {
    console.error('❌ Error:', error);
  }
}

checkAndCleanOrphanedUsers();
