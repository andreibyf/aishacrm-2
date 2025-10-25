-- Migration 014: AI Conversations and Messages
-- Creates tables for AI agent conversations, replacing Base44 agents API

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  agent_name VARCHAR(255) NOT NULL DEFAULT 'crm_assistant',
  metadata JSONB DEFAULT '{}',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) DEFAULT 'active',
  CONSTRAINT fk_conversations_tenant FOREIGN KEY (tenant_id) REFERENCES tenant(id) ON DELETE CASCADE
);

-- Conversation messages table
CREATE TABLE IF NOT EXISTS conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  role VARCHAR(50) NOT NULL, -- 'user', 'assistant', 'system'
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  created_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_messages_conversation FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversations_tenant_id ON conversations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_conversations_agent_name ON conversations(agent_name);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
CREATE INDEX IF NOT EXISTS idx_conversations_created_date ON conversations(created_date DESC);

CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON conversation_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_date ON conversation_messages(created_date ASC);

-- RLS policies for conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Users can only see conversations for their tenant
CREATE POLICY conversations_tenant_isolation ON conversations
  FOR ALL
  USING (tenant_id::text = current_setting('app.current_tenant_id', true));

-- RLS policies for conversation_messages
ALTER TABLE conversation_messages ENABLE ROW LEVEL SECURITY;

-- Users can only see messages for conversations they have access to
CREATE POLICY messages_tenant_isolation ON conversation_messages
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM conversations
      WHERE conversations.id = conversation_messages.conversation_id
        AND conversations.tenant_id::text = current_setting('app.current_tenant_id', true)
    )
  );

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversations TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON conversation_messages TO service_role;
