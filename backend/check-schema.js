import pkg from 'pg';
import dotenv from 'dotenv';

const { Pool } = pkg;

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function checkSchema() {
  try {
    // Check tenant table structure
    console.log('\n📋 TENANT TABLE STRUCTURE:\n');
    const tenantSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'tenant' 
      ORDER BY ordinal_position
    `);
    tenantSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Check employees table structure
    console.log('\n👔 EMPLOYEES TABLE STRUCTURE:\n');
    const employeesSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'employees' 
      ORDER BY ordinal_position
    `);
    employeesSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Check accounts table structure
    console.log('\n📁 ACCOUNTS TABLE STRUCTURE:\n');
    const accountsSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'accounts' 
      ORDER BY ordinal_position
    `);
    accountsSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Check contacts table structure
    console.log('\n👥 CONTACTS TABLE STRUCTURE:\n');
    const contactsSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'contacts' 
      ORDER BY ordinal_position
    `);
    contactsSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Check leads table structure
    console.log('\n🎯 LEADS TABLE STRUCTURE:\n');
    const leadsSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'leads' 
      ORDER BY ordinal_position
    `);
    leadsSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Check opportunities table structure
    console.log('\n💼 OPPORTUNITIES TABLE STRUCTURE:\n');
    const opportunitiesSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'opportunities' 
      ORDER BY ordinal_position
    `);
    opportunitiesSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Check users table structure
    console.log('\n🔐 USERS TABLE STRUCTURE:\n');
    const usersSchema = await pool.query(`
      SELECT 
        column_name, 
        data_type, 
        is_nullable,
        column_default
      FROM information_schema.columns 
      WHERE table_name = 'users' 
      ORDER BY ordinal_position
    `);
    usersSchema.rows.forEach(col => {
      console.log(`  ${col.column_name.padEnd(20)} ${col.data_type.padEnd(20)} ${col.is_nullable === 'YES' ? 'NULL' : 'NOT NULL'}`);
      if (col.column_default) console.log(`    Default: ${col.column_default}`);
    });

    // Sample a few records to see actual data
    console.log('\n📊 SAMPLE DATA CHECK:\n');
    
    try {
      const tenantSample = await pool.query('SELECT id, tenant_id FROM tenant LIMIT 3');
      console.log('  Tenant samples:');
      tenantSample.rows.forEach(row => {
        console.log(`    id: ${row.id} (type: ${typeof row.id}), tenant_id: ${row.tenant_id} (type: ${typeof row.tenant_id})`);
      });
    } catch (err) {
      console.log('  No tenant data:', err.message);
    }

    try {
      const employeeSample = await pool.query('SELECT id, tenant_id, email FROM employees LIMIT 3');
      console.log('  Employee samples:');
      employeeSample.rows.forEach(row => {
        console.log(`    id: ${row.id}, tenant_id: ${row.tenant_id}, email: ${row.email}`);
      });
    } catch (err) {
      console.log('  No employee data:', err.message);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await pool.end();
  }
}

checkSchema();
