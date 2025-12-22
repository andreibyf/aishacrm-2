#!/usr/bin/env node
import pkg from 'pg';
const { Client } = pkg;
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '.env') });

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function verifyTestUser() {
  try {
    await client.connect();
    console.log('✅ Connected to database\n');

    // Check employee record
    const employeeResult = await client.query(`
      SELECT 
        id,
        tenant_id,
        first_name,
        last_name,
        email,
        role,
        status,
        metadata
      FROM employees 
      WHERE email IN ('test@aishacrm.com', 'admin@aishacrm.com')
        AND tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69'
      ORDER BY email
    `);

    console.log('👤 Employee Records:');
    if (employeeResult.rows.length > 0) {
      employeeResult.rows.forEach(emp => {
        console.log(`\n   ${emp.email}:`);
        console.log(`   ✓ ID: ${emp.id}`);
        console.log(`   ✓ Name: ${emp.first_name} ${emp.last_name}`);
        console.log(`   ✓ Role: ${emp.role}`);
        console.log(`   ✓ Status: ${emp.status}`);
        console.log(`   ✓ Permissions: ${JSON.stringify(emp.metadata.permissions || [])}`);
        console.log(`   ✓ Access Level: ${emp.metadata.access_level || 'N/A'}`);
        console.log(`   ✓ Is SuperAdmin: ${emp.metadata.is_superadmin || false}`);
      });
    } else {
      console.log('   ❌ No employee records found!');
    }

    // Check module settings
    console.log('\n📦 Module Settings:');
    const moduleResult = await client.query(`
      SELECT 
        module_name,
        is_enabled,
        settings
      FROM modulesettings 
      WHERE tenant_id = '6cb4c008-4847-426a-9a2e-918ad70e7b69'
        AND module_name IN ('crm', 'developer')
      ORDER BY module_name
    `);

    if (moduleResult.rows.length > 0) {
      moduleResult.rows.forEach(mod => {
        console.log(`   ✓ ${mod.module_name}: ${mod.is_enabled ? 'ENABLED' : 'DISABLED'}`);
        console.log(`     Settings: ${JSON.stringify(mod.settings)}`);
      });
    } else {
      console.log('   ⚠️ No module settings found for tenant');
    }

    // Check tenant
    console.log('\n🏢 Tenant Info:');
    const tenantResult = await client.query(`
      SELECT id, name, status FROM tenant WHERE id = '6cb4c008-4847-426a-9a2e-918ad70e7b69'
    `);

    if (tenantResult.rows.length > 0) {
      const tenant = tenantResult.rows[0];
      console.log(`   ✓ ID: ${tenant.id}`);
      console.log(`   ✓ Name: ${tenant.name}`);
      console.log(`   ✓ Status: ${tenant.status}`);
    } else {
      console.log('   ❌ Tenant not found!');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await client.end();
  }
}

verifyTestUser();
