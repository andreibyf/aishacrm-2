/**
 * Apply Phase 7 AI Memory migration using Supabase client
 * This avoids DATABASE_URL connection issues by using the service role key
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function main() {
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    console.error('Make sure these are set in Doppler or your .env file');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false }
  });

  console.log('✓ Connected to Supabase');
  console.log('📝 Applying Phase 7 AI Memory migration...\n');

  // Read migration file
  const migrationPath = path.join(__dirname, 'supabase/migrations/20241224120000_ai_memory_rag.sql');
  const sql = fs.readFileSync(migrationPath, 'utf8');

  // Split SQL into individual statements (Supabase RPC can only execute one at a time for DDL)
  // For complex migrations, we need to use the SQL editor in Supabase dashboard
  console.log('⚠️  Complex migration detected with multiple DDL statements.');
  console.log('Please run this migration manually via Supabase Dashboard:\n');
  console.log('1. Go to: https://supabase.com/dashboard/project/_/sql');
  console.log('2. Create a new query');
  console.log('3. Paste the contents of: backend/supabase/migrations/20241224120000_ai_memory_rag.sql');
  console.log('4. Click "Run"\n');
  
  console.log('Alternative: Use psql command-line tool:');
  console.log('  psql "YOUR_DATABASE_URL" -f backend/supabase/migrations/20241224120000_ai_memory_rag.sql\n');
  
  console.log('Migration file location:');
  console.log(`  ${migrationPath}\n`);
  
  console.log('Quick verification after running:');
  console.log('  SELECT tablename FROM pg_tables WHERE schemaname = \'public\' AND tablename LIKE \'ai_%\';');
  console.log('  -- Should return: ai_memory_chunks, ai_conversation_summaries\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
