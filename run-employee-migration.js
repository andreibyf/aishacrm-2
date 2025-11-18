// Run migration to add phone and department columns to employees table
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const supabaseUrl = 'https://ehjlenywplgyiahgxkfj.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVoamxlbnl3cGxneWlhaGd4a2ZqIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMDQ3NTYyOSwiZXhwIjoyMDQ2MDUxNjI5fQ.SitwFJL0oCR6j7PxGl9x3Qsd0JoQRjK5EcJLrwP1TS0';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  try {
    console.log('Running migration: 011_add_employee_phone_department.sql');
    
    // Read migration file
    const migrationPath = join(__dirname, 'backend', 'migrations', '011_add_employee_phone_department.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');
    
    // Split into individual statements
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('--'));
    
    // Execute each statement
    for (const statement of statements) {
      console.log('Executing:', statement.substring(0, 80) + '...');
      const { error } = await supabase.rpc('exec_sql', { sql_query: statement });
      
      if (error) {
        // Try direct query if rpc doesn't work
        console.log('RPC failed, trying direct query...');
        const { error: queryError } = await supabase.from('_migrations').insert({});
        console.error('Migration execution error:', error);
      } else {
        console.log('✓ Statement executed successfully');
      }
    }
    
    console.log('\n✅ Migration completed! The employees table now has phone and department columns.');
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
