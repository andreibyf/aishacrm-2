-- ============================================================
-- AI MEMORY + CONTEXT (RAG) - PHASE 7
-- ============================================================
-- Implements tenant-scoped memory storage for Ai-SHA using pgvector
-- Stores embeddings of notes, activities, transcripts, emails, and documents
-- Enables context-aware conversations via vector similarity search

-- ============================================================
-- 1. ENABLE PGVECTOR EXTENSION
-- ============================================================
CREATE EXTENSION IF NOT EXISTS vector;

-- ============================================================
-- 2. AI MEMORY CHUNKS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_memory_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Tenant isolation (CRITICAL for security)
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  
  -- Entity linkage (optional - memory may be general or entity-specific)
  entity_type text, -- lead, contact, account, opportunity, etc.
  entity_id uuid, -- FK to the entity (not enforced to allow flexibility)
  
  -- Source tracking
  source_type text NOT NULL, -- note, activity, transcript, email, document
  
  -- Content and embedding
  content text NOT NULL,
  content_hash text NOT NULL, -- SHA-256 hash for deduplication
  embedding vector(1536) NOT NULL, -- OpenAI text-embedding-3-small dimension
  
  -- Metadata (source-specific fields like author, timestamps, etc.)
  metadata jsonb DEFAULT '{}',
  
  -- Constraints
  CONSTRAINT ai_memory_chunks_source_type_check 
    CHECK (source_type IN ('note', 'activity', 'transcript', 'email', 'document'))
);

-- ============================================================
-- 3. INDEXES FOR PERFORMANCE
-- ============================================================
-- Unique constraint for deduplication (prevent duplicate content per tenant)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_memory_chunks_tenant_hash 
  ON public.ai_memory_chunks(tenant_id, content_hash);

-- Tenant filtering (used in all queries)
CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_tenant_id 
  ON public.ai_memory_chunks(tenant_id);

-- Entity filtering (for entity-specific context queries)
CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_entity 
  ON public.ai_memory_chunks(tenant_id, entity_type, entity_id);

-- Source type filtering
CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_source_type 
  ON public.ai_memory_chunks(tenant_id, source_type);

-- Vector similarity search (IVFFlat index for cosine distance)
-- Using lists = rows / 1000 for optimal performance (will create 1 list per ~1000 rows)
CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_embedding 
  ON public.ai_memory_chunks 
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Timestamp for cleanup/archival
CREATE INDEX IF NOT EXISTS idx_ai_memory_chunks_created_at 
  ON public.ai_memory_chunks(created_at DESC);

-- ============================================================
-- 4. CONVERSATION SUMMARIES TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.ai_conversation_summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  
  -- Tenant isolation
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  
  -- Conversation identifier (conversation UUID or user-session key)
  conversation_key text NOT NULL,
  
  -- Rolling summary content
  summary text NOT NULL,
  
  -- Metadata (message count, last update reason, etc.)
  metadata jsonb DEFAULT '{}',
  
  -- Unique constraint (one summary per tenant conversation)
  CONSTRAINT ai_conversation_summaries_unique 
    UNIQUE (tenant_id, conversation_key)
);

-- ============================================================
-- 5. CONVERSATION SUMMARIES INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_ai_conversation_summaries_tenant_id 
  ON public.ai_conversation_summaries(tenant_id);

CREATE INDEX IF NOT EXISTS idx_ai_conversation_summaries_updated_at 
  ON public.ai_conversation_summaries(updated_at DESC);

-- ============================================================
-- 6. UPDATED_AT TRIGGERS
-- ============================================================
-- Reuse existing trigger function if available, otherwise create
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc 
    WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE OR REPLACE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $func$ LANGUAGE plpgsql;
  END IF;
END $$;

-- Apply triggers
DROP TRIGGER IF EXISTS update_ai_memory_chunks_updated_at ON public.ai_memory_chunks;
CREATE TRIGGER update_ai_memory_chunks_updated_at
  BEFORE UPDATE ON public.ai_memory_chunks
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_conversation_summaries_updated_at ON public.ai_conversation_summaries;
CREATE TRIGGER update_ai_conversation_summaries_updated_at
  BEFORE UPDATE ON public.ai_conversation_summaries
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
-- ============================================================
-- Enable RLS on both tables
ALTER TABLE public.ai_memory_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_conversation_summaries ENABLE ROW LEVEL SECURITY;

-- POLICY: Service role has full access (backend operations)
-- No direct client access - all operations must go through backend API

-- Memory chunks: tenant-scoped read policy (for authenticated users via service role)
CREATE POLICY ai_memory_chunks_tenant_isolation ON public.ai_memory_chunks
  FOR ALL
  TO authenticated
  USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

-- Conversation summaries: tenant-scoped policy
CREATE POLICY ai_conversation_summaries_tenant_isolation ON public.ai_conversation_summaries
  FOR ALL
  TO authenticated
  USING (tenant_id::text = current_setting('request.jwt.claims', true)::json->>'tenant_id');

-- Service role bypasses RLS (backend has full access for cross-tenant operations by superadmins)
-- This is handled automatically by Supabase

-- ============================================================
-- 8. COMMENTS FOR DOCUMENTATION
-- ============================================================
COMMENT ON TABLE public.ai_memory_chunks IS 
  'Stores text chunks with embeddings for RAG-based context retrieval in Ai-SHA conversations. Tenant-scoped with entity linkage.';

COMMENT ON COLUMN public.ai_memory_chunks.content_hash IS 
  'SHA-256 hash of content for deduplication. Prevents storing identical content multiple times per tenant.';

COMMENT ON COLUMN public.ai_memory_chunks.embedding IS 
  'Vector embedding (1536 dimensions) generated via OpenAI text-embedding-3-small or compatible model. Used for cosine similarity search.';

COMMENT ON TABLE public.ai_conversation_summaries IS 
  'Stores rolling summaries of tenant conversations to provide compact context in AI prompts. Updated after each assistant response.';

-- ============================================================
-- 9. GRANT PERMISSIONS
-- ============================================================
-- Grant access to authenticated role (used by Supabase client with RLS)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_memory_chunks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ai_conversation_summaries TO authenticated;

-- Grant access to service role (used by backend with service-role key)
GRANT ALL ON public.ai_memory_chunks TO service_role;
GRANT ALL ON public.ai_conversation_summaries TO service_role;

-- ============================================================
-- MIGRATION COMPLETE
-- ============================================================
-- This migration enables:
-- 1. Vector similarity search for context retrieval
-- 2. Tenant-isolated memory storage with deduplication
-- 3. Entity-specific context (leads, accounts, contacts, opportunities)
-- 4. Rolling conversation summaries for compact context
-- 5. RLS policies for security
--
-- Next steps:
-- - Implement backend/lib/aiMemory/ modules
-- - Wire ingestion hooks into notes and activities routes
-- - Integrate memory retrieval into AI prompt assembly
-- ============================================================
