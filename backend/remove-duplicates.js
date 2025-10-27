import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

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

async function removeDuplicates() {
  try {
    console.log('🧹 Removing duplicate users from employees table...\n');

    // Find all duplicate combinations (same email + tenant_id)
    const duplicates = await pool.query(`
      SELECT email, tenant_id, COUNT(*) as count
      FROM employees
      GROUP BY email, tenant_id
      HAVING COUNT(*) > 1
      ORDER BY email
    `);

    if (duplicates.rows.length === 0) {
      console.log('✅ No duplicates found!');
      return;
    }

    console.log(`Found ${duplicates.rows.length} duplicate combinations:\n`);

    let totalDeleted = 0;

    for (const dup of duplicates.rows) {
      console.log(`\n📧 Processing: ${dup.email} | Tenant: ${dup.tenant_id} (${dup.count} records)`);

      // Get all records for this email+tenant, ordered by created_at DESC
      const records = await pool.query(`
        SELECT id, email, tenant_id, role, status, created_at
        FROM employees
        WHERE email = $1 AND tenant_id = $2
        ORDER BY created_at DESC
      `, [dup.email, dup.tenant_id]);

      // Keep the most recent (first one), delete the rest
      const toKeep = records.rows[0];
      const toDelete = records.rows.slice(1);

      console.log(`   ✅ KEEPING: ID ${toKeep.id} (created: ${toKeep.created_at})`);
      console.log(`   🗑️  DELETING ${toDelete.length} older record(s):`);

      for (const record of toDelete) {
        console.log(`      - ID ${record.id} (created: ${record.created_at})`);
        
        // Delete this record
        await pool.query(`DELETE FROM employees WHERE id = $1`, [record.id]);
        totalDeleted++;
      }
    }

    console.log(`\n✅ Cleanup complete! Deleted ${totalDeleted} duplicate records.`);

    // Show final count
    const finalCount = await pool.query(`SELECT COUNT(*) FROM employees`);
    console.log(`📊 Remaining users: ${finalCount.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

removeDuplicates();
