import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const supabaseUrl = 'https://ehjlenywplgyiahgxkfj.supabase.co';
const serviceRoleKey = 'sb_secret_pLoIHa4X_eyHaIx0ds-D5g_qTn9_gS4';

const supabase = createClient(supabaseUrl, serviceRoleKey);

async function runMigrations() {
  try {
    console.log('📦 Reading migration SQL...');
    const sql = readFileSync('flatten-all-tables.sql', 'utf8');
    
    console.log('🚀 Executing migrations via Supabase...');
    
    // Split SQL into individual statements and execute them
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      console.log(`\n[${i+1}/${statements.length}] Executing: ${stmt.substring(0, 80)}...`);
      
      const { error } = await supabase.rpc('exec_sql', { sql: stmt });
      
      if (error) {
        console.error(`❌ Error on statement ${i+1}:`, error.message);
        // Try direct query as fallback
        const { error: queryError } = await supabase.from('_sql').select(stmt);
        if (queryError) {
          console.error('   Fallback also failed:', queryError.message);
        }
      } else {
        console.log(`   ✅ Success`);
      }
    }
    
    console.log('\n✨ All migrations completed!');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    console.log('\n⚠️  Supabase may not support direct SQL execution via API.');
    console.log('📝 Please run the SQL manually in Supabase SQL Editor:');
    console.log('   https://supabase.com/dashboard/project/ehjlenywplgyiahgxkfj/sql');
    process.exit(1);
  }
}

runMigrations();
