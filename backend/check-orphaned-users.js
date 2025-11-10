import 'dotenv/config';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';

const { Pool } = pg;

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

// Use direct DATABASE_URL connection
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('❌ Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  ssl: { rejectUnauthorized: false }
});

async function checkOrphanedUsers() {
  console.log('🔍 Checking for orphaned users in database tables...\n');

  try {
    // Get all auth users
    const { data: authData } = await supabase.auth.admin.listUsers();
    const authEmails = new Set(authData.users.map(u => u.email));

    console.log(`Found ${authEmails.size} users in Supabase Auth\n`);

    // Check users table
    const usersResult = await pool.query('SELECT id, email, full_name, role FROM users ORDER BY created_at DESC');
    console.log(`📊 Users table: ${usersResult.rows.length} records`);
    
    const orphanedUsers = usersResult.rows.filter(u => !authEmails.has(u.email));
    if (orphanedUsers.length > 0) {
      console.log(`\n⚠️  Found ${orphanedUsers.length} orphaned users (in users table but not in auth):`);
      orphanedUsers.forEach((u, i) => {
        console.log(`${i + 1}. ${u.email} (${u.full_name || 'No name'}) - Role: ${u.role} - ID: ${u.id}`);
      });
    }

    // Check employees table
    const employeesResult = await pool.query('SELECT id, email, full_name, tenant_id FROM employees ORDER BY created_at DESC');
    console.log(`\n📊 Employees table: ${employeesResult.rows.length} records`);
    
    const orphanedEmployees = employeesResult.rows.filter(e => !authEmails.has(e.email));
    if (orphanedEmployees.length > 0) {
      console.log(`\n⚠️  Found ${orphanedEmployees.length} orphaned employees (in employees table but not in auth):`);
      orphanedEmployees.forEach((e, i) => {
        console.log(`${i + 1}. ${e.email} (${e.full_name || 'No name'}) - Tenant: ${e.tenant_id} - ID: ${e.id}`);
      });
    }

    if (orphanedUsers.length === 0 && orphanedEmployees.length === 0) {
      console.log('\n✅ No orphaned users found!');
    } else {
      console.log(`\n\n💡 To delete these orphaned records, run:`);
      console.log(`   node clean-orphaned-users.js`);
    }

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    await pool.end();
  }
}

checkOrphanedUsers();
