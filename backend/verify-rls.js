import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function verifyRLS() {
  try {
    console.log('\n🔍 VERIFYING ROW LEVEL SECURITY\n');
    
    // Check which tables have RLS enabled
    console.log('📊 Tables with RLS Status:\n');
    const rlsStatus = await pool.query(`
      SELECT
        tablename,
        CASE WHEN rowsecurity THEN '✅ ENABLED' ELSE '❌ DISABLED' END as rls_status
      FROM pg_tables
      WHERE schemaname = 'public'
      ORDER BY tablename
    `);
    
    rlsStatus.rows.forEach(row => {
      console.log(`  ${row.tablename.padEnd(30)} ${row.rls_status}`);
    });
    
    // Check tables WITHOUT RLS (security issue!)
    console.log('\n⚠️  Tables WITHOUT RLS (potential security issues):\n');
    const noRLS = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND rowsecurity = false
      ORDER BY tablename
    `);
    
    if (noRLS.rows.length === 0) {
      console.log('  ✅ All tables have RLS enabled!\n');
    } else {
      noRLS.rows.forEach(row => {
        console.log(`  ❌ ${row.tablename}`);
      });
      console.log('');
    }
    
    // Count policies per table
    console.log('📋 Policy Count per Table:\n');
    const policyCounts = await pool.query(`
      SELECT
        tablename,
        COUNT(*) as policy_count
      FROM pg_policies
      WHERE schemaname = 'public'
      GROUP BY tablename
      ORDER BY policy_count DESC, tablename
    `);
    
    policyCounts.rows.forEach(row => {
      console.log(`  ${row.tablename.padEnd(30)} ${row.policy_count} policies`);
    });
    
    // Tables with RLS but NO policies (will block all access!)
    console.log('\n⚠️  Tables with RLS ENABLED but NO policies:\n');
    const noPolicies = await pool.query(`
      SELECT t.tablename
      FROM pg_tables t
      LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
      WHERE t.schemaname = 'public'
        AND t.rowsecurity = true
        AND p.policyname IS NULL
      ORDER BY t.tablename
    `);
    
    if (noPolicies.rows.length === 0) {
      console.log('  ✅ All RLS-enabled tables have policies!\n');
    } else {
      console.log('  These tables will BLOCK all PostgREST access (backend service_role can still access):\n');
      noPolicies.rows.forEach(row => {
        console.log(`  🔒 ${row.tablename}`);
      });
      console.log('');
    }
    
    // Check specific critical tables
    console.log('🔐 Critical Table Security:\n');
    const criticalTables = ['performance_logs', 'system_logs', 'tenant', 'modulesettings', 'api_key', 'apikey'];
    
    for (const table of criticalTables) {
      const policies = await pool.query(`
        SELECT policyname, cmd, roles
        FROM pg_policies
        WHERE schemaname = 'public' AND tablename = $1
      `, [table]);
      
      if (policies.rows.length === 0) {
        console.log(`  ${table.padEnd(25)} 🔒 LOCKED (no policies = backend only)`);
      } else {
        console.log(`  ${table.padEnd(25)} ✅ ${policies.rows.length} policies`);
        policies.rows.forEach(p => {
          console.log(`    - ${p.policyname} (${p.cmd})`);
        });
      }
    }
    
    console.log('\n✅ RLS Verification Complete!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

verifyRLS();
