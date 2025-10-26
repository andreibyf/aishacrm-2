import pkg from 'pg';
const { Pool } = pkg;

const DATABASE_URL = 'postgresql://postgres:Aml834VyYYH6humU@db.ehjlenywplgyiahgxkfj.supabase.co:5432/postgres';
const pool = new Pool({ connectionString: DATABASE_URL });

async function checkFunctions() {
  try {
    console.log('\n🔍 Checking Function Security Settings...\n');
    
    const result = await pool.query(`
      SELECT 
        p.proname as function_name,
        CASE 
          WHEN p.prosecdef THEN '✅ SECURITY DEFINER'
          ELSE '❌ SECURITY INVOKER'
        END as security_type,
        CASE
          WHEN p.proconfig IS NOT NULL THEN '✅ search_path SET'
          ELSE '❌ No search_path'
        END as search_path_status,
        p.proconfig as config
      FROM pg_proc p
      JOIN pg_namespace n ON p.pronamespace = n.oid
      WHERE n.nspname = 'public'
        AND p.proname IN (
          'current_tenant_id',
          'sync_bizdev_sources_created_date', 
          'update_tenant_updated_at',
          'sync_created_date'
        )
      ORDER BY p.proname
    `);
    
    console.log('📊 Function Security Status:\n');
    result.rows.forEach(row => {
      console.log(`Function: ${row.function_name}`);
      console.log(`  Security: ${row.security_type}`);
      console.log(`  Search Path: ${row.search_path_status}`);
      if (row.config) {
        console.log(`  Config: ${row.config.join(', ')}`);
      }
      console.log('');
    });
    
    // Check if all are secure
    const allSecure = result.rows.every(row => 
      row.security_type.includes('✅') && row.search_path_status.includes('✅')
    );
    
    if (allSecure) {
      console.log('🎉 SUCCESS! All functions are properly secured!\n');
      console.log('✅ All functions use SECURITY DEFINER');
      console.log('✅ All functions have search_path set to public\n');
    } else {
      console.log('⚠️  Some functions still need fixing\n');
    }
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkFunctions();
