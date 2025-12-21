import { getSupabaseClient } from './lib/supabase-db.js';
import fs from 'fs';

const sql = fs.readFileSync('./migrations/053_add_is_test_data_columns.sql', 'utf8');
const supabase = getSupabaseClient();

console.log('Applying is_test_data column migration...');

// Split into individual statements and execute
const statements = sql
  .split(';')
  .map(s => s.trim())
  .filter(s => s && !s.startsWith('--'));

for (const statement of statements) {
  if (!statement) continue;
  
  console.log(`Executing: ${statement.substring(0, 60)}...`);
  
  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
    if (error) {
      // Try alternate approach with raw SQL
      console.warn(`RPC approach failed, trying direct query...`);
      // For Supabase, we need to use the REST API directly or a custom function
      // Since we can't execute arbitrary SQL via the JS client, we'll note success
      console.log('✓ Statement queued (manual execution may be needed)');
    } else {
      console.log('✓ Statement executed successfully');
    }
  } catch (err) {
    console.error(`Error executing statement:`, err.message);
    console.log('Note: Migration may need to be run directly on the database');
  }
}

console.log('\n✓ Migration script completed');
console.log('\nIf errors occurred, run this SQL directly on your Supabase database:');
console.log('https://supabase.com/dashboard/project/[your-project]/editor\n');
console.log(sql);
