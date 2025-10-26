import pkg from 'pg';
const { Pool } = pkg;

// Use the same connection as apply-supabase-migrations.js
const DATABASE_URL = 'postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DATABASE_URL });

async function checkRLS() {
  try {
    console.log('\n🔍 Checking RLS Status...\n');
    
    // Count tables with and without RLS
    const result = await pool.query(`
      SELECT 
        COUNT(*) FILTER (WHERE rowsecurity = true) as rls_enabled,
        COUNT(*) FILTER (WHERE rowsecurity = false) as rls_disabled,
        COUNT(*) as total
      FROM pg_tables
      WHERE schemaname = 'public'
    `);
    
    console.log('📊 RLS Summary:');
    console.log(`   Total tables: ${result.rows[0].total}`);
    console.log(`   ✅ RLS Enabled: ${result.rows[0].rls_enabled}`);
    console.log(`   ❌ RLS Disabled: ${result.rows[0].rls_disabled}\n`);
    
    if (parseInt(result.rows[0].rls_disabled) === 0) {
      console.log('🎉 SUCCESS! All public tables have RLS enabled!\n');
    } else {
      console.log('⚠️  Some tables still need RLS enabled:\n');
      const disabled = await pool.query(`
        SELECT tablename
        FROM pg_tables
        WHERE schemaname = 'public' AND rowsecurity = false
        ORDER BY tablename
      `);
      disabled.rows.forEach(row => console.log(`   - ${row.tablename}`));
      console.log('');
    }
    
    // Check critical tables
    console.log('🔐 Critical Tables Status:');
    const critical = await pool.query(`
      SELECT tablename, rowsecurity
      FROM pg_tables
      WHERE schemaname = 'public' 
        AND tablename IN ('performance_logs', 'system_logs', 'tenant', 'modulesettings', 'api_key')
      ORDER BY tablename
    `);
    
    critical.rows.forEach(row => {
      const status = row.rowsecurity ? '✅ SECURED' : '❌ VULNERABLE';
      console.log(`   ${row.tablename.padEnd(20)} ${status}`);
    });
    
    console.log('\n✅ Verification complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkRLS();
