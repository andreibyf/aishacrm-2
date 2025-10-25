import pg from 'pg';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from backend directory
dotenv.config({ path: join(__dirname, '..', '.env') });

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function findAndDeleteDuplicateContacts() {
  console.log('🔍 Finding duplicate contacts...\n');
  
  // Find all contacts ordered by email and creation date
  const result = await pool.query(`
    SELECT id, email, first_name, last_name, created_date
    FROM public.contacts
    WHERE email IS NOT NULL
    ORDER BY email, created_date ASC
  `);
  
  const contacts = result.rows;
  console.log(`📊 Total contacts with emails: ${contacts.length}`);
  
  // Group by email
  const emailGroups = {};
  contacts.forEach(contact => {
    if (!emailGroups[contact.email]) {
      emailGroups[contact.email] = [];
    }
    emailGroups[contact.email].push(contact);
  });
  
  // Find duplicates (groups with more than 1 contact)
  const duplicates = Object.entries(emailGroups).filter(([_, cs]) => cs.length > 1);
  
  console.log(`\n🔍 Found ${duplicates.length} duplicate email groups\n`);
  
  let totalDuplicates = 0;
  const idsToDelete = [];
  
  duplicates.forEach(([email, cs]) => {
    console.log(`📧 ${email} (${cs.length} records):`);
    // Keep the first one (oldest), mark others for deletion
    cs.forEach((c, idx) => {
      if (idx === 0) {
        console.log(`  ✅ KEEP: ${c.id} (${c.first_name} ${c.last_name}) - ${c.created_date}`);
      } else {
        console.log(`  ❌ DELETE: ${c.id} (${c.first_name} ${c.last_name}) - ${c.created_date}`);
        idsToDelete.push(c.id);
        totalDuplicates++;
      }
    });
    console.log();
  });
  
  if (idsToDelete.length === 0) {
    console.log('✅ No duplicates to delete!');
    return;
  }
  
  console.log(`\n📝 Summary: ${totalDuplicates} duplicate contacts to delete`);
  console.log(`🔥 Deleting ${idsToDelete.length} duplicate records...\n`);
  
  // Delete all at once using IN clause
  await pool.query(
    'DELETE FROM public.contacts WHERE id = ANY($1)',
    [idsToDelete]
  );
  
  console.log(`✅ Deleted ${idsToDelete.length} duplicate contacts.`);
}

async function findAndDeleteDuplicateLeads() {
  console.log('\n\n🔍 Finding duplicate leads...\n');
  
  // Find all leads ordered by email and creation date
  const result = await pool.query(`
    SELECT id, email, first_name, last_name, created_date
    FROM public.leads
    WHERE email IS NOT NULL
    ORDER BY email, created_date ASC
  `);
  
  const leads = result.rows;
  console.log(`📊 Total leads with emails: ${leads.length}`);
  
  // Group by email
  const emailGroups = {};
  leads.forEach(lead => {
    if (!emailGroups[lead.email]) {
      emailGroups[lead.email] = [];
    }
    emailGroups[lead.email].push(lead);
  });
  
  // Find duplicates
  const duplicates = Object.entries(emailGroups).filter(([_, ls]) => ls.length > 1);
  
  console.log(`\n🔍 Found ${duplicates.length} duplicate email groups\n`);
  
  let totalDuplicates = 0;
  const idsToDelete = [];
  
  duplicates.forEach(([email, ls]) => {
    console.log(`📧 ${email} (${ls.length} records):`);
    // Keep the first one (oldest), mark others for deletion
    ls.forEach((l, idx) => {
      if (idx === 0) {
        console.log(`  ✅ KEEP: ${l.id} (${l.first_name} ${l.last_name}) - ${l.created_date}`);
      } else {
        console.log(`  ❌ DELETE: ${l.id} (${l.first_name} ${l.last_name}) - ${l.created_date}`);
        idsToDelete.push(l.id);
        totalDuplicates++;
      }
    });
    console.log();
  });
  
  if (idsToDelete.length === 0) {
    console.log('✅ No duplicates to delete!');
    return;
  }
  
  console.log(`\n📝 Summary: ${totalDuplicates} duplicate leads to delete`);
  console.log(`🔥 Deleting ${idsToDelete.length} duplicate records...\n`);
  
  // Delete all at once using IN clause
  await pool.query(
    'DELETE FROM public.leads WHERE id = ANY($1)',
    [idsToDelete]
  );
  
  console.log(`✅ Deleted ${idsToDelete.length} duplicate leads.`);
}

// Run cleanup
(async () => {
  try {
    // First, let's see what tables exist
    console.log('🔍 Checking available tables...\n');
    const tablesResult = await pool.query(`
      SELECT table_schema, table_name 
      FROM information_schema.tables 
      WHERE table_type = 'BASE TABLE'
      AND table_schema NOT IN ('pg_catalog', 'information_schema')
      ORDER BY table_schema, table_name
    `);
    
    console.log('Available tables:');
    tablesResult.rows.forEach(row => {
      console.log(`  - ${row.table_schema}.${row.table_name}`);
    });
    console.log('\n');
    
    await findAndDeleteDuplicateContacts();
    await findAndDeleteDuplicateLeads();
    console.log('\n\n🎉 All cleanup operations complete!');
    await pool.end();
    process.exit(0);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await pool.end();
    process.exit(1);
  }
})();
