/**
 * Migration Runner using Supabase Client
 * Executes SQL migration files using Supabase's raw SQL execution
 * 
 * Usage: node run-migration-supabase.js <migration-file.sql>
 * Example: node run-migration-supabase.js 051_fix_table_name_consistency.sql
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: join(__dirname, '.env') });

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ Missing required environment variables:');
  console.error('   - SUPABASE_URL');
  console.error('   - SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

// Get migration filename from command line
const migrationFile = process.argv[2];
if (!migrationFile) {
  console.error('❌ Usage: node run-migration-supabase.js <migration-file.sql>');
  console.error('   Example: node run-migration-supabase.js 051_fix_table_name_consistency.sql');
  process.exit(1);
}

const migrationPath = resolve(__dirname, 'migrations', migrationFile);

console.log('🚀 Migration Runner (Supabase Client)');
console.log('=====================================');
console.log(`Migration: ${migrationFile}`);
console.log(`Path: ${migrationPath}`);
console.log(`Supabase: ${SUPABASE_URL}`);
console.log('');

async function runMigration() {
  // Initialize Supabase client with service role key (bypasses RLS)
  const _supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  try {
    // Read migration SQL
    console.log('📖 Reading migration file...');
    const sql = readFileSync(migrationPath, 'utf8');
    console.log(`   ✓ Loaded ${sql.length} characters`);
    console.log('');

    // Execute raw SQL using Supabase's RPC
    // Note: For DDL statements, we need to use the Postgres REST API directly
    console.log('⚙️  Executing migration...');
    console.log('   (This may take a moment for complex migrations)');
    console.log('');

    // Use Supabase's underlying Postgres REST API for raw SQL
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_SERVICE_ROLE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ query: sql })
    });

    if (!response.ok) {
      // If exec_sql function doesn't exist, try alternative approach
      if (response.status === 404) {
        console.log('⚠️  exec_sql function not found, trying direct SQL execution...');
        
        // Try using pg pool instead
        const { Pool } = await import('pg');
        const DATABASE_URL = process.env.DATABASE_URL;
        
        if (!DATABASE_URL) {
          throw new Error('DATABASE_URL not found in environment variables');
        }

        let pool;
        
        try {
          // Try with SSL first
          pool = new Pool({
            connectionString: DATABASE_URL,
            ssl: {
              rejectUnauthorized: false
            }
          });

          // Capture NOTICE messages
          const notices = [];
          pool.on('notice', (msg) => {
            notices.push(msg.message);
          });

          console.log('   📡 Connected to database (with SSL)');
          const result = await pool.query(sql);
          await pool.end();
          
          console.log('');
          console.log('✅ Migration executed successfully!');
          console.log('');

          if (notices.length > 0) {
            console.log('📢 Migration notices:');
            notices.forEach(notice => console.log(`   ${notice}`));
            console.log('');
          }

          if (result.rowCount !== null) {
            console.log(`   Rows affected: ${result.rowCount}`);
          }

          console.log('');
          console.log('🔍 Verifying tables...');
          await verifyTables();
          return;
          
        } catch (sslError) {
          if (pool) await pool.end().catch(() => {});
          
          // Retry without SSL if server doesn't support it
          if (/does not support SSL connections/i.test(sslError.message)) {
            console.log('   ⚠️  SSL not supported, retrying without SSL...');
            
            pool = new Pool({
              connectionString: DATABASE_URL,
              ssl: false
            });

            // Capture NOTICE messages
            const notices = [];
            pool.on('notice', (msg) => {
              notices.push(msg.message);
            });

            console.log('   📡 Connected to database (without SSL)');
            const result = await pool.query(sql);
            await pool.end();
            
            console.log('');
            console.log('✅ Migration executed successfully!');
            console.log('');

            if (notices.length > 0) {
              console.log('📢 Migration notices:');
              notices.forEach(notice => console.log(`   ${notice}`));
              console.log('');
            }

            if (result.rowCount !== null) {
              console.log(`   Rows affected: ${result.rowCount}`);
            }

            console.log('');
            console.log('🔍 Verifying tables...');
            await verifyTables();
            return;
          } else {
            throw sslError;
          }
        }
      }

      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }

    const result = await response.json();
    
    console.log('');
    console.log('✅ Migration executed successfully!');
    console.log('');

    if (result && typeof result === 'object') {
      console.log('📊 Result:', JSON.stringify(result, null, 2));
    }

    console.log('');
    console.log('🎉 Migration completed!');

  } catch (error) {
    console.error('');
    console.error('❌ Migration failed!');
    console.error('');
    console.error('Error:', error.message);
    if (error.stack) {
      console.error('');
      console.error('Stack trace:');
      console.error(error.stack);
    }
    process.exit(1);
  }
}

async function verifyTables(pool) {
  try {
    // Check if we're using passed pool or need to create one
    let localPool = pool;
    let shouldClose = false;

    if (!localPool) {
      const { Pool } = await import('pg');
      const DATABASE_URL = process.env.DATABASE_URL;
      localPool = new Pool({
        connectionString: DATABASE_URL,
        ssl: {
          rejectUnauthorized: false
        }
      });
      shouldClose = true;
    }

    // Check for renamed tables
    const tablesQuery = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_name IN ('performance_log', 'performance_logs', 'bizdev_source', 'bizdev_sources')
      ORDER BY table_name;
    `;

    const result = await localPool.query(tablesQuery);
    
    console.log('   Tables found:');
    if (result.rows.length === 0) {
      console.log('   (none of the target tables exist)');
    } else {
      result.rows.forEach(row => {
        const icon = row.table_name.endsWith('s') ? '✓' : '⚠️';
        console.log(`   ${icon} ${row.table_name}`);
      });
    }

    if (shouldClose) {
      await localPool.end();
    }
  } catch (error) {
    console.log('   ⚠️  Could not verify tables:', error.message);
  }
}

// Run the migration
runMigration().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
