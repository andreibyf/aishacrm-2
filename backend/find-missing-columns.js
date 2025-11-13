/**
 * Find all UI fields that don't exist in the database
 * Compares frontend field usage with actual database schema
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabaseClient } from './lib/supabase-db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supa = getSupabaseClient();

// Known tables to check
const TABLES = [
  'accounts',
  'contacts',
  'leads',
  'opportunities',
  'employees',
  'users',
  'activities',
  'notes'
];

async function getDatabaseColumns(tableName) {
  try {
    const { data, error } = await supa
      .from(tableName)
      .select('*')
      .limit(0); // Get schema only
    
    if (error) throw error;
    
    // Supabase returns empty array but with column info
    // We need to query information_schema instead
    const { data: cols, error: colError } = await supa.rpc('exec_sql', {
      query: `
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = '${tableName}' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
      `
    });
    
    if (colError) {
      // Fallback: Try direct query to get one row
      const { data: sample } = await supa.from(tableName).select('*').limit(1).single();
      if (sample) {
        return Object.keys(sample);
      }
      return [];
    }
    
    return cols?.map(c => c.column_name) || [];
  } catch (err) {
    console.error(`  Error fetching columns for ${tableName}:`, err.message);
    return [];
  }
}

function extractFieldsFromFrontend(tableName) {
  const fields = new Set();
  const srcDir = path.join(__dirname, '..', 'src');
  
  // Common patterns to search for
  const patterns = [
    new RegExp(`${tableName}\\.(\\w+)`, 'g'),
    new RegExp(`formData\\.(\\w+)`, 'g'),
    new RegExp(`handleChange\\(['"]([\\w_]+)['"]`, 'g'),
    new RegExp(`(?:address_1|address_2|city|state|zip|country|employee_count|tags|display_name|navigation_permissions|phone|email|annual_revenue|description|status|type|website|industry|company|job_title|title|subject|body|due_date|close_date|amount|probability|stage|source|first_name|last_name|mobile|hire_date|employment_status|employment_type|hourly_rate|emergency_contact_name|emergency_contact_phone|skills|manager_employee_id|is_active)`, 'g')
  ];
  
  function searchDirectory(dir) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          if (entry.name === 'node_modules' || entry.name === '.git') continue;
          searchDirectory(fullPath);
        } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          // Extract field references
          const matches = content.match(/[\w_]+\s*[:=]\s*(?:\w+\.)?[\w_]+/g) || [];
          
          for (const match of matches) {
            const fieldMatch = match.match(/(address_1|address_2|city|state|zip|country|employee_count|tags|display_name|navigation_permissions|phone|email|annual_revenue|description|status|type|website|industry|company|job_title|title|subject|body|due_date|close_date|amount|probability|stage|source|first_name|last_name|mobile|hire_date|employment_status|employment_type|hourly_rate|emergency_contact_name|emergency_contact_phone|skills|manager_employee_id|is_active|num_employees)/);
            if (fieldMatch) {
              fields.add(fieldMatch[1]);
            }
          }
        }
      }
    } catch (err) {
      // Ignore errors
    }
  }
  
  searchDirectory(srcDir);
  return Array.from(fields);
}

console.log('\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  FRONTEND vs DATABASE FIELD MISMATCH REPORT                   ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const results = {
  totalMismatches: 0,
  byTable: {}
};

for (const table of TABLES) {
  console.log(`\n📊 TABLE: ${table.toUpperCase()}`);
  console.log('━'.repeat(64));
  
  // Get database columns
  const dbColumns = await getDatabaseColumns(table);
  console.log(`\n  Database columns (${dbColumns.length}):`);
  console.log(`    ${dbColumns.join(', ')}`);
  
  // Get frontend fields
  const frontendFields = extractFieldsFromFrontend(table);
  console.log(`\n  Frontend fields found (${frontendFields.length}):`);
  console.log(`    ${frontendFields.slice(0, 20).join(', ')}${frontendFields.length > 20 ? '...' : ''}`);
  
  // Find missing columns
  const missing = frontendFields.filter(f => !dbColumns.includes(f) && f !== 'metadata');
  
  if (missing.length > 0) {
    console.log(`\n  ❌ MISSING COLUMNS IN DATABASE (${missing.length}):`);
    missing.forEach(col => {
      console.log(`     • ${col}`);
    });
    results.totalMismatches += missing.length;
    results.byTable[table] = missing;
  } else {
    console.log(`\n  ✅ No missing columns`);
  }
}

console.log('\n\n╔════════════════════════════════════════════════════════════════╗');
console.log('║  SUMMARY                                                       ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

console.log(`Total tables checked: ${TABLES.length}`);
console.log(`Total missing columns: ${results.totalMismatches}`);

if (results.totalMismatches > 0) {
  console.log('\n⚠️  TABLES WITH MISSING COLUMNS:\n');
  for (const [table, columns] of Object.entries(results.byTable)) {
    if (columns.length > 0) {
      console.log(`  ${table.toUpperCase()}:`);
      columns.forEach(col => console.log(`    • ${col}`));
    }
  }
  
  console.log('\n📝 RECOMMENDED ACTION:\n');
  console.log('  These fields are referenced in the UI but don\'t exist as database columns.');
  console.log('  They should be stored in the metadata JSONB column and expanded on read.\n');
  console.log('  Add migrations to create these columns OR update routes to handle them in metadata.\n');
}

console.log('\n═══════════════════════════════════════════════════════════════\n');

process.exit(0);
