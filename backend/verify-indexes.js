import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = 'postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DATABASE_URL });

async function verifyIndexes() {
  try {
    console.log('\n🔍 Verifying Foreign Key Indexes...\n');
    
    // Check if the new indexes exist
    const result = await pool.query(`
      SELECT 
        tablename,
        indexname,
        CASE 
          WHEN indexname IS NOT NULL THEN '✅ Created'
          ELSE '❌ Missing'
        END as status
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname IN (
          'idx_cash_flow_account_id',
          'idx_contacts_account_id', 
          'idx_opportunities_account_id',
          'idx_opportunities_contact_id',
          'idx_subscription_plan_id'
        )
      ORDER BY tablename, indexname
    `);
    
    console.log('📊 Foreign Key Indexes Created:\n');
    result.rows.forEach(row => {
      console.log(`  ${row.status} ${row.tablename.padEnd(20)} → ${row.indexname}`);
    });
    
    console.log('\n');
    
    // Summary
    const expectedCount = 5;
    const actualCount = result.rows.length;
    
    if (actualCount === expectedCount) {
      console.log(`🎉 SUCCESS! All ${expectedCount} foreign key indexes created!\n`);
      console.log('✅ cash_flow.account_id     → Indexed');
      console.log('✅ contacts.account_id      → Indexed');
      console.log('✅ opportunities.account_id → Indexed');
      console.log('✅ opportunities.contact_id → Indexed');
      console.log('✅ subscription.plan_id     → Indexed\n');
      console.log('🚀 JOIN queries on these tables will now be faster!\n');
    } else {
      console.log(`⚠️  Expected ${expectedCount} indexes, found ${actualCount}\n`);
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyIndexes();
