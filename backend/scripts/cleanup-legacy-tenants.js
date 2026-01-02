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
  ssl: process.env.DATABASE_URL?.includes('localhost') ? false : { rejectUnauthorized: false },
});

// Standard UUID for all test data
const STANDARD_TENANT_UUID = '6cb4c008-4847-426a-9a2e-918ad70e7b69';

// Legacy tenant IDs to remove
const LEGACY_TENANT_IDS = [
  'local-tenant-001',
  'test-tenant-001',
  'tenant-123',
  'test-tenant',
  'user-tenant',
];

async function clearLegacyTenantData() {
  console.log('🔧 Clearing legacy tenant data from E2E tests...\n');
  
  const tables = [
    'contacts',
    'leads', 
    'accounts',
    'opportunities',
    'activities',
    'employees',
    'bizdev_sources',
    'workflows',
    'system_logs',
    'import_logs',
    'audit_logs'
  ];

  let totalDeleted = 0;

  for (const table of tables) {
    try {
      // Check if table exists
      const { rows: tableCheck } = await pool.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1`,
        [table]
      );
      
      if (tableCheck.length === 0) {
        console.log(`⏭️  Table ${table} does not exist, skipping...`);
        continue;
      }

      // Check if table has tenant_id column
      const { rows: columnCheck } = await pool.query(
        `SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name='tenant_id'`,
        [table]
      );

      if (columnCheck.length === 0) {
        console.log(`⏭️  Table ${table} has no tenant_id column, skipping...`);
        continue;
      }

      // Delete records with legacy tenant IDs
      const { rowCount } = await pool.query(
        `DELETE FROM ${table} WHERE tenant_id = ANY($1::text[])`,
        [LEGACY_TENANT_IDS]
      );

      if (rowCount > 0) {
        console.log(`🧹 Deleted ${rowCount} records from ${table}`);
        totalDeleted += rowCount;
      } else {
        console.log(`✅ No legacy data in ${table}`);
      }
    } catch (err) {
      console.error(`❌ Error cleaning ${table}:`, err.message);
    }
  }

  console.log(`\n🎉 Total records deleted: ${totalDeleted}`);
}

async function ensureStandardTenant() {
  console.log('\n🏗️  Ensuring standard test tenant exists...\n');
  
  try {
    // Upsert the standard tenant
    const { rows } = await pool.query(
      `INSERT INTO tenant (tenant_id, name, status, subscription_tier, branding_settings, metadata)
       VALUES ($1, 'Test Tenant', 'active', 'tier4', '{}'::jsonb, '{"purpose":"e2e-testing"}'::jsonb)
       ON CONFLICT (tenant_id) DO UPDATE SET
         name = EXCLUDED.name,
         status = EXCLUDED.status,
         updated_at = NOW()
       RETURNING tenant_id, name`,
      [STANDARD_TENANT_UUID]
    );

    console.log(`✅ Standard tenant ready: ${rows[0].name} (${rows[0].tenant_id})`);
  } catch (err) {
    console.error('❌ Error ensuring tenant:', err.message);
  }
}

async function main() {
  try {
    console.log('═'.repeat(60));
    console.log('  E2E Test Data Cleanup - Tenant UUID Migration');
    console.log('═'.repeat(60));
    console.log();

    await clearLegacyTenantData();
    await ensureStandardTenant();

    console.log('\n' + '═'.repeat(60));
    console.log('✅ Cleanup complete! All test data now uses UUID:');
    console.log(`   ${STANDARD_TENANT_UUID}`);
    console.log('═'.repeat(60));
    
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Cleanup failed:', err);
    await pool.end();
    process.exit(1);
  }
}

main();
