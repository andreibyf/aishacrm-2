/**
 * Check column types for FK constraint compatibility
 * Usage: doppler run -- node check-fk-types.js
 */
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false }
});

async function checkTypes() {
  console.log('\n🔍 CHECKING COLUMN TYPES FOR FK COMPATIBILITY...\n');
  console.log(`   Connecting to: ${supabaseUrl}\n`);

  // Query to check column data types
  const { data, error } = await supabase.rpc('exec_sql', {
    sql_query: `
      SELECT 
        table_name,
        column_name,
        data_type,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND (
          (table_name = 'employees' AND column_name = 'id')
          OR (table_name = 'accounts' AND column_name IN ('id', 'assigned_to'))
          OR (table_name = 'contacts' AND column_name IN ('id', 'assigned_to', 'account_id'))
          OR (table_name = 'leads' AND column_name IN ('id', 'assigned_to'))
          OR (table_name = 'opportunities' AND column_name IN ('id', 'assigned_to', 'account_id', 'contact_id'))
          OR (table_name = 'activities' AND column_name IN ('id', 'assigned_to'))
        )
      ORDER BY table_name, column_name
    `
  });

  if (error) {
    // Fallback: try direct query via REST
    console.log('RPC not available, checking via Supabase client...\n');
    
    // Check employees.id type
    const { data: empData } = await supabase.from('employees').select('id').limit(1);
    console.log('employees sample id:', empData?.[0]?.id, typeof empData?.[0]?.id);
    
    // Check leads.assigned_to type
    const { data: leadData } = await supabase.from('leads').select('id, assigned_to').limit(1);
    console.log('leads sample:', leadData?.[0]);
    
    return;
  }

  console.log('Column Type Analysis:\n');
  console.log('  Table             | Column        | Type');
  console.log('  ------------------|---------------|--------');
  
  const typeMap = {};
  (data || []).forEach(row => {
    const key = `${row.table_name}.${row.column_name}`;
    typeMap[key] = row.udt_name;
    console.log(`  ${row.table_name.padEnd(17)} | ${row.column_name.padEnd(13)} | ${row.udt_name}`);
  });

  console.log('\n');

  // Check compatibility
  const employeesIdType = typeMap['employees.id'];
  const issues = [];

  const checkPairs = [
    ['leads.assigned_to', 'employees.id'],
    ['contacts.assigned_to', 'employees.id'],
    ['contacts.account_id', 'accounts.id'],
    ['opportunities.assigned_to', 'employees.id'],
    ['opportunities.account_id', 'accounts.id'],
    ['opportunities.contact_id', 'contacts.id'],
    ['activities.assigned_to', 'employees.id'],
    ['accounts.assigned_to', 'employees.id'],
  ];

  console.log('FK Compatibility Check:\n');
  checkPairs.forEach(([fkCol, refCol]) => {
    const fkType = typeMap[fkCol];
    const refType = typeMap[refCol];
    const match = fkType === refType;
    const status = match ? '✅' : '❌';
    console.log(`  ${status} ${fkCol} (${fkType || 'MISSING'}) -> ${refCol} (${refType || 'MISSING'})`);
    if (!match && fkType && refType) {
      issues.push({ fkCol, fkType, refCol, refType });
    }
  });

  if (issues.length > 0) {
    console.log('\n⚠️  TYPE MISMATCHES FOUND:\n');
    issues.forEach(({ fkCol, fkType, refCol, refType }) => {
      console.log(`   ${fkCol} is ${fkType} but ${refCol} is ${refType}`);
      if (fkType === 'text' && refType === 'uuid') {
        console.log(`   FIX: ALTER TABLE ${fkCol.split('.')[0]} ALTER COLUMN ${fkCol.split('.')[1]} TYPE uuid USING ${fkCol.split('.')[1]}::uuid;`);
      }
    });
  } else {
    console.log('\n✅ All column types are compatible for FK constraints!');
  }

  console.log('\n');
}

checkTypes().catch(console.error);
