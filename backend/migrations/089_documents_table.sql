-- Migration 089: Create documents table for v2 document management
-- Phase 4 requirement: AI-enhanced document management

BEGIN;

-- Create documents table if not exists
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES tenant(id) ON DELETE CASCADE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    file_url TEXT,
    file_type VARCHAR(100),
    file_size BIGINT,
    storage_path TEXT,
    
    -- Entity relationships
    related_type VARCHAR(50), -- 'opportunity', 'account', 'contact', 'lead'
    related_id UUID,
    
    -- AI classification and metadata
    metadata JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES users(id),
    updated_by UUID REFERENCES users(id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_documents_tenant_id ON documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_documents_related ON documents(related_type, related_id);
CREATE INDEX IF NOT EXISTS idx_documents_file_type ON documents(file_type);
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at DESC);

-- Enable RLS
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS documents_tenant_isolation ON documents;
DROP POLICY IF EXISTS documents_select_policy ON documents;
DROP POLICY IF EXISTS documents_insert_policy ON documents;
DROP POLICY IF EXISTS documents_update_policy ON documents;
DROP POLICY IF EXISTS documents_delete_policy ON documents;

-- Create RLS policies
CREATE POLICY documents_tenant_isolation ON documents
    FOR ALL
    USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);

-- Add comment for documentation
COMMENT ON TABLE documents IS 'Stores document metadata with AI classification. File content stored in Supabase Storage.';
COMMENT ON COLUMN documents.metadata IS 'JSONB field for AI classification, tags, and custom attributes';
COMMENT ON COLUMN documents.related_type IS 'Entity type this document is attached to (opportunity, account, contact, lead)';

COMMIT;
