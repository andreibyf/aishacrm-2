import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Load environment variables from .env.local then .env (if present)
dotenv.config({ path: '.env.local' });
dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.warn('WARN: DATABASE_URL is not set. Skipping RLS check.');
  process.exit(0);
}

const pool = new Pool({ connectionString: databaseUrl });

async function main() {
  let failures = 0;
  try {
    console.log('\n🔍 CI: Checking Row Level Security (RLS) posture');

    // 1) Tables without RLS enabled
    const noRls = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND rowsecurity = false
      ORDER BY tablename
    `);
    if (noRls.rows.length > 0) {
      failures++;
      console.error('❌ Tables WITHOUT RLS enabled:');
      noRls.rows.forEach(r => console.error(`  - ${r.tablename}`));
    } else {
      console.log('✅ All public tables have RLS enabled');
    }

    // 2) Tables with RLS but no policies (PostgREST will be blocked)
    const noPolicies = await pool.query(`
      SELECT t.tablename
      FROM pg_tables t
      LEFT JOIN pg_policies p ON t.tablename = p.tablename AND t.schemaname = p.schemaname
      WHERE t.schemaname = 'public' AND t.rowsecurity = true AND p.policyname IS NULL
      ORDER BY t.tablename
    `);
    if (noPolicies.rows.length > 0) {
      // Some tables are intentionally locked (backend-only). We'll allowlist known cases if needed.
      const allowLocked = new Set([
        // Add table names here if intentionally policy-less with RLS enabled
      ]);
      const offenders = noPolicies.rows.map(r => r.tablename).filter(t => !allowLocked.has(t));
      if (offenders.length > 0) {
        failures++;
        console.error('❌ RLS-enabled tables WITHOUT policies (will block PostgREST):');
        offenders.forEach(t => console.error(`  - ${t}`));
      } else {
        console.log('✅ All RLS-enabled tables that require access have policies');
      }
    } else {
      console.log('✅ All RLS-enabled tables have at least one policy');
    }

    // 3) Spot-check critical tables exist (optional, non-fatal)
    const critical = ['performance_logs', 'system_logs', 'tenant', 'modulesettings', 'systembranding'];
    const criticalCheck = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename = ANY($1)
    `, [critical]);
    const missingCritical = critical.filter(t => !criticalCheck.rows.find(r => r.tablename === t));
    if (missingCritical.length) {
      console.warn('⚠️  Missing expected critical tables (non-fatal):');
      missingCritical.forEach(t => console.warn(`  - ${t}`));
    }

    if (failures > 0) {
      console.error(`\n❌ RLS check failed with ${failures} issue(s).`);
      process.exit(1);
    }
    console.log('\n✅ RLS check passed.');
  } catch (err) {
    console.error('❌ Error during RLS check:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
