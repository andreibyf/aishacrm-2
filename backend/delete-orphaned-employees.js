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

async function deleteOrphanedEmployees() {
  console.log('🔍 Finding orphaned employees...\n');

  // Get all auth users
  const { data: authData } = await supabase.auth.admin.listUsers();
  const authEmails = new Set(authData.users.map(u => u.email));

  console.log(`Auth users: ${Array.from(authEmails).join(', ')}\n`);

  // Get all employees
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('id, email, tenant_id');

  if (empError) {
    console.error('❌ Error fetching employees:', empError);
    return;
  }

  if (!employees) {
    console.log('✅ No employees found');
    return;
  }

  console.log(`Found ${employees.length} total employees\n`);

  // Find orphaned (no email or email not in auth)
  const orphaned = employees.filter(e => !e.email || !authEmails.has(e.email));

  console.log(`📋 Found ${orphaned.length} orphaned employees to delete:\n`);

  if (orphaned.length === 0) {
    console.log('✅ No orphaned employees!');
    return;
  }

  console.log(`First 10 examples:`);
  orphaned.slice(0, 10).forEach((e, i) => {
    console.log(`${i + 1}. ${e.email || 'NO EMAIL'} (ID: ${e.id}) - Tenant: ${e.tenant_id}`);
  });

  console.log(`\n⚠️  Deleting ${orphaned.length} employees in 5 seconds... Press Ctrl+C to cancel\n`);
  await new Promise(resolve => setTimeout(resolve, 5000));

  console.log('🗑️  Starting deletion...\n');

  let successCount = 0;
  let failCount = 0;

  // Delete in batches for better performance
  const batchSize = 50;
  for (let i = 0; i < orphaned.length; i += batchSize) {
    const batch = orphaned.slice(i, i + batchSize);
    const ids = batch.map(e => e.id);

    try {
      const { error } = await supabase
        .from('employees')
        .delete()
        .in('id', ids);

      if (error) {
        console.error(`❌ Failed batch ${i / batchSize + 1}:`, error.message);
        failCount += batch.length;
      } else {
        successCount += batch.length;
        console.log(`✅ Deleted batch ${i / batchSize + 1} (${batch.length} employees)`);
      }
    } catch (err) {
      console.error(`❌ Error in batch ${i / batchSize + 1}:`, err.message);
      failCount += batch.length;
    }
  }

  console.log(`\n📊 Summary:`);
  console.log(`✅ Successfully deleted: ${successCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log(`📝 Total processed: ${orphaned.length}`);
}

deleteOrphanedEmployees();
