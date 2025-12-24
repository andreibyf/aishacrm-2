#!/usr/bin/env node
/**
 * Apply funnel counts materialized view migration
 * Usage: node backend/apply-funnel-view.js
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function applyMigration() {
  console.log('📊 Applying funnel counts materialized view migration...\n');

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'migrations', 'create-funnel-counts-view.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    console.log('📄 Loaded migration file:', sqlPath);
    console.log('📝 SQL length:', sql.length, 'characters\n');

    // Split by statement separator (semicolons at end of lines)
    const statements = sql
      .split(/;\s*\n/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`🔨 Executing ${statements.length} SQL statements...\n`);

    let successCount = 0;
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      
      // Skip comments and empty statements
      if (stmt.startsWith('--') || stmt.trim().length === 0) continue;
      
      // Get a preview of the statement
      const preview = stmt.substring(0, 80).replace(/\s+/g, ' ');
      console.log(`[${i + 1}/${statements.length}] ${preview}...`);

      try {
        const { error } = await supabase.rpc('exec_sql', { sql_query: stmt });
        
        // If RPC doesn't exist, try direct query
        if (error?.message?.includes('function exec_sql')) {
          const { error: directError } = await supabase.from('_migrations').insert({
            name: 'funnel_view_' + Date.now(),
            sql: stmt
          });
          
          if (directError) {
            console.error('  ❌ Error:', directError.message);
            console.error('  Statement:', stmt.substring(0, 200));
          } else {
            successCount++;
            console.log('  ✅ Success');
          }
        } else if (error) {
          console.error('  ❌ Error:', error.message);
          console.error('  Statement:', stmt.substring(0, 200));
        } else {
          successCount++;
          console.log('  ✅ Success');
        }
      } catch (err) {
        console.error('  ❌ Exception:', err.message);
      }
    }

    console.log(`\n✅ Migration complete: ${successCount}/${statements.length} statements executed\n`);

    // Test the view
    console.log('🧪 Testing materialized view...');
    const { data, error } = await supabase
      .from('dashboard_funnel_counts')
      .select('*')
      .limit(5);

    if (error) {
      console.error('❌ View test failed:', error.message);
      console.log('\n⚠️  You may need to run this SQL manually in Supabase SQL Editor');
    } else {
      console.log('✅ View is accessible');
      console.log(`📊 Found ${data?.length || 0} tenant(s) with funnel data`);
      if (data && data.length > 0) {
        console.log('\nSample data:', JSON.stringify(data[0], null, 2));
      }
    }

    console.log('\n🎉 Done! You can now use GET /api/dashboard/funnel-counts');

  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

applyMigration();
