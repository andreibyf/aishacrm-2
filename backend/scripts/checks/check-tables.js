import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkTables() {
  try {
    const result = await pool.query(`
      SELECT tablename 
      FROM pg_tables 
      WHERE schemaname = 'public' 
      ORDER BY tablename
    `);
    
    console.log(`\n📊 Database Tables (${result.rows.length}):\n`);
    result.rows.forEach(row => console.log(`  ✓ ${row.tablename}`));
    
    // Check for key CRM tables
    const expectedTables = ['account', 'contact', 'lead', 'opportunity', 'note', 'activity'];
    console.log('\n📋 Key CRM Tables Status:\n');
    
    const existingTables = result.rows.map(r => r.tablename);
    expectedTables.forEach(table => {
      const exists = existingTables.includes(table) || existingTables.includes(table + 's');
      console.log(`  ${exists ? '✅' : '❌'} ${table}`);
    });
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkTables();
