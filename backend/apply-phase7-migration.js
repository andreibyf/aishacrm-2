/**
 * Apply Phase 7 AI Memory migration using Supabase client
 * This avoids DATABASE_URL connection issues by using the service role key
 * 
 * PHASE 7: RAG (Retrieval Augmented Generation) for Ai-SHA
 * - Creates ai_memory_chunks table for storing text embeddings
 * - Creates ai_conversation_summaries table for rolling conversation context
 * - Enables pgvector extension for vector similarity search
 */

import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function checkTablesExist(supabase) {
  try {
    // Check if ai_memory_chunks table exists
    const { data: memoryChunks, error: memoryErr } = await supabase
      .from('ai_memory_chunks')
      .select('id')
      .limit(1);
    
    // Check if ai_conversation_summaries table exists
    const { data: summaries, error: summaryErr } = await supabase
      .from('ai_conversation_summaries')
      .select('id')
      .limit(1);
    
    // PGRST116 = table doesn't exist, any other error means table exists
    const memoryTableExists = !memoryErr || memoryErr.code !== '42P01';
    const summaryTableExists = !summaryErr || summaryErr.code !== '42P01';
    
    return {
      ai_memory_chunks: memoryTableExists,
      ai_conversation_summaries: summaryTableExists,
      allExist: memoryTableExists && summaryTableExists
    };
  } catch (err) {
    console.error('Error checking table existence:', err.message);
    return { ai_memory_chunks: false, ai_conversation_summaries: false, allExist: false };
  }
}

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
  console.log('📝 Checking Phase 7 AI Memory tables...\n');

  // Check if tables already exist
  const tableStatus = await checkTablesExist(supabase);
  
  if (tableStatus.allExist) {
    console.log('✅ Phase 7 AI Memory tables already exist:');
    console.log('   • ai_memory_chunks: ✓');
    console.log('   • ai_conversation_summaries: ✓');
    console.log('\n🎉 Migration already applied. No action needed.\n');
    
    // Show memory stats if available
    try {
      const { count: chunkCount } = await supabase
        .from('ai_memory_chunks')
        .select('*', { count: 'exact', head: true });
      const { count: summaryCount } = await supabase
        .from('ai_conversation_summaries')
        .select('*', { count: 'exact', head: true });
      
      console.log('📊 Current stats:');
      console.log(`   • Memory chunks: ${chunkCount || 0}`);
      console.log(`   • Conversation summaries: ${summaryCount || 0}`);
    } catch (e) { void e; }
    
    return;
  }

  // Tables don't exist - show migration instructions
  console.log('⚠️  Phase 7 AI Memory tables not found:');
  console.log(`   • ai_memory_chunks: ${tableStatus.ai_memory_chunks ? '✓' : '✗ MISSING'}`);
  console.log(`   • ai_conversation_summaries: ${tableStatus.ai_conversation_summaries ? '✓' : '✗ MISSING'}`);
  console.log('\n');

  // Read migration file
  const migrationPath = path.join(__dirname, 'supabase/migrations/20241224120000_ai_memory_rag.sql');
  
  if (!fs.existsSync(migrationPath)) {
    console.error('❌ Migration file not found:', migrationPath);
    process.exit(1);
  }

  console.log('📋 Please run this migration manually via Supabase Dashboard:\n');
  console.log('   1. Go to: https://supabase.com/dashboard/project/_/sql');
  console.log('   2. Create a new query');
  console.log('   3. Paste the contents of: backend/supabase/migrations/20241224120000_ai_memory_rag.sql');
  console.log('   4. Click "Run"\n');
  
  console.log('Alternative: Use psql command-line tool:');
  console.log('   psql "$DATABASE_URL" -f backend/supabase/migrations/20241224120000_ai_memory_rag.sql\n');
  
  console.log('Migration file location:');
  console.log(`   ${migrationPath}\n`);
  
  console.log('Verification query after running:');
  console.log("   SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'ai_%';");
  console.log('   -- Expected: ai_memory_chunks, ai_conversation_summaries\n');
  
  console.log('Environment variables for memory system:');
  console.log('   MEMORY_ENABLED=true              # Enable RAG memory system');
  console.log('   MEMORY_TOP_K=8                   # Number of memory chunks to retrieve');
  console.log('   MEMORY_MAX_CHUNK_CHARS=3500      # Max characters per chunk');
  console.log('   MEMORY_MIN_SIMILARITY=0.7        # Minimum cosine similarity threshold');
  console.log('   MEMORY_EMBEDDING_PROVIDER=openai # Embedding provider');
  console.log('   MEMORY_EMBEDDING_MODEL=text-embedding-3-small # Embedding model\n');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
