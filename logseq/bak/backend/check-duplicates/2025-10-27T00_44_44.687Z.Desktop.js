import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

// Use Supabase connection
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function checkDuplicates() {
  try {
    console.log('🔍 Checking for duplicate users in employees table...\n');

    // Get all users
    const result = await pool.query(`
      SELECT id, email, tenant_id, role, is_active, created_at
      FROM employees
      ORDER BY email, tenant_id
    `);

    console.log(`📊 Total users: ${result.rows.length}\n`);

    // Group by email
    const emailGroups = {};
    result.rows.forEach(user => {
      if (!emailGroups[user.email]) {
        emailGroups[user.email] = [];
      }
      emailGroups[user.email].push(user);
    });

    // Find duplicates
    console.log('🔎 Duplicate Analysis:\n');
    
    let totalDuplicates = 0;
    Object.entries(emailGroups).forEach(([email, users]) => {
      if (users.length > 1) {
        totalDuplicates++;
        console.log(`📧 Email: ${email} (${users.length} records)`);
        users.forEach((user, idx) => {
          console.log(`   ${idx + 1}. ID: ${user.id} | Tenant: ${user.tenant_id || 'NULL'} | Role: ${user.employee_role || user.role} | Active: ${user.is_active} | Created: ${user.created_at}`);
        });
        console.log('');
      }
    });

    if (totalDuplicates === 0) {
      console.log('✅ No duplicate emails found!');
    } else {
      console.log(`⚠️  Found ${totalDuplicates} emails with duplicate records`);
      console.log('\n💡 Recommendations:');
      console.log('   1. Keep the most recent record (latest created_at)');
      console.log('   2. Delete inactive duplicates first');
      console.log('   3. For same email + same tenant: definitely a duplicate to remove');
    }

    // Check for same email + same tenant (true duplicates)
    console.log('\n🚨 TRUE DUPLICATES (same email + same tenant):\n');
    
    const trueDuplicates = await pool.query(`
      SELECT email, tenant_id, COUNT(*) as count
      FROM employees
      GROUP BY email, tenant_id
      HAVING COUNT(*) > 1
      ORDER BY count DESC, email
    `);

    if (trueDuplicates.rows.length > 0) {
      console.log(`Found ${trueDuplicates.rows.length} true duplicate combinations:\n`);
      trueDuplicates.rows.forEach(dup => {
        console.log(`   📧 ${dup.email} | Tenant: ${dup.tenant_id || 'NULL'} | Count: ${dup.count}`);
      });
    } else {
      console.log('✅ No true duplicates (same email + tenant) found!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkDuplicates();
