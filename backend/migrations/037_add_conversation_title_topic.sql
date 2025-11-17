-- Migration 037: Add title and topic fields to conversations
-- Enhances conversation organization with meaningful titles and categorization

-- Add title column (auto-generated from first user message)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- Add topic column for categorization (leads, accounts, support, general, etc.)
ALTER TABLE conversations 
ADD COLUMN IF NOT EXISTS topic VARCHAR(100) DEFAULT 'general';

-- Add index for topic filtering
CREATE INDEX IF NOT EXISTS idx_conversations_topic ON conversations(topic);

-- Add index for combined tenant_id + topic filtering
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_topic ON conversations(tenant_id, topic);

-- Add comment to explain usage
COMMENT ON COLUMN conversations.title IS 'User-friendly title for the conversation, auto-generated from first user message or manually set';
COMMENT ON COLUMN conversations.topic IS 'Category of conversation: leads, accounts, opportunities, contacts, support, general, etc.';
