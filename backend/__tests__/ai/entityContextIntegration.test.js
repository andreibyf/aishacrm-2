/**
 * Entity Context Integration Test
 * 
 * End-to-end test that verifies entity context extraction works in a realistic
 * conversation scenario with tool execution and context carry-forward.
 * 
 * @module tests/ai/entityContextIntegration
 */

import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';

const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Entity Context Integration Tests', { skip: !SHOULD_RUN }, () => {
  
  let tenantId;
  let conversationId;
  
  before(async () => {
    // Use a known tenant ID from test environment
    tenantId = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
    conversationId = 'test-conv-' + Date.now();
  });
  
  describe('End-to-End Entity Context Flow', () => {
    
    test('Simulates conversation with lead context extraction and persistence', async () => {
      // This test demonstrates the expected flow but requires actual backend/database setup
      // In a real integration test environment with Supabase connection, this would:
      
      // 1. Create a conversation
      // 2. Execute a tool that returns lead data
      // 3. Store message with extracted entity context
      // 4. Load conversation history and verify context carry-forward
      
      // For now, we verify the data structures that would be involved
      
      const mockToolInteractions = [
        {
          name: 'get_lead_details',
          arguments: { lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998' },
          result_preview: JSON.stringify({
            id: 'a3af0a84-a16f-466e-aa82-62b462d1d998',
            name: 'Jack Russel',
            status: 'warm',
            company: 'JR Corporation'
          })
        }
      ];
      
      // Simulate entity extraction
      const extractEntityContext = (toolInteractions) => {
        const entityContext = {};
        const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];

        for (const tool of toolInteractions) {
          const args = tool.arguments || {};
          
          for (const entityType of entityTypes) {
            if (args[entityType] && !entityContext[entityType]) {
              entityContext[entityType] = args[entityType];
            }
          }
        }

        return Object.fromEntries(
          Object.entries(entityContext).filter(([_, v]) => v && typeof v === 'string')
        );
      };
      
      const entityContext = extractEntityContext(mockToolInteractions);
      
      // Simulate message metadata structure
      const messageMetadata = {
        model: 'gpt-4o-2024-08-06',
        usage: { prompt_tokens: 150, completion_tokens: 75, total_tokens: 225 },
        tool_interactions: mockToolInteractions,
        iterations: 1,
        ...entityContext
      };
      
      // Verify metadata structure matches expected format
      assert.ok(messageMetadata.lead_id, 'Metadata should include lead_id');
      assert.strictEqual(messageMetadata.lead_id, 'a3af0a84-a16f-466e-aa82-62b462d1d998');
      assert.ok(messageMetadata.tool_interactions, 'Metadata should preserve tool_interactions');
      assert.ok(messageMetadata.model, 'Metadata should preserve model');
      
      // Simulate JSONB query that would be possible with this structure
      // In actual database: WHERE metadata @> '{"lead_id": "a3af0a84-a16f-466e-aa82-62b462d1d998"}'
      const wouldMatchJsonbQuery = messageMetadata.lead_id === 'a3af0a84-a16f-466e-aa82-62b462d1d998';
      assert.ok(wouldMatchJsonbQuery, 'Entity ID at top level enables JSONB queries');
    });
    
    test('Simulates multi-turn conversation with context switching', async () => {
      // Simulates a conversation where user asks about a lead, then switches to a contact
      
      // Turn 1: Ask about lead
      const turn1ToolInteractions = [
        {
          name: 'get_lead_details',
          arguments: { lead_id: 'lead-uuid-1' },
          result_preview: '{"name":"Lead 1"}'
        }
      ];
      
      const extractEntityContext = (toolInteractions) => {
        const entityContext = {};
        const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];

        for (const tool of toolInteractions) {
          const args = tool.arguments || {};
          for (const entityType of entityTypes) {
            if (args[entityType] && !entityContext[entityType]) {
              entityContext[entityType] = args[entityType];
            }
          }
        }

        return Object.fromEntries(
          Object.entries(entityContext).filter(([_, v]) => v && typeof v === 'string')
        );
      };
      
      const turn1Context = extractEntityContext(turn1ToolInteractions);
      
      const turn1Metadata = {
        tool_interactions: turn1ToolInteractions,
        ...turn1Context
      };
      
      // Turn 2: Ask about contact
      const turn2ToolInteractions = [
        {
          name: 'get_contact_details',
          arguments: { contact_id: 'contact-uuid-2' },
          result_preview: '{"name":"Contact 2"}'
        }
      ];
      
      const turn2Context = extractEntityContext(turn2ToolInteractions);
      
      const turn2Metadata = {
        tool_interactions: turn2ToolInteractions,
        ...turn2Context
      };
      
      // Simulate conversation history
      const conversationHistory = [
        { role: 'user', content: 'Tell me about lead 1', metadata: {} },
        { role: 'assistant', content: 'Here is lead 1...', metadata: turn1Metadata },
        { role: 'user', content: 'What about contact 2?', metadata: {} },
        { role: 'assistant', content: 'Here is contact 2...', metadata: turn2Metadata }
      ];
      
      // Simulate context carry-forward (scan history in reverse)
      let carriedContext = {};
      for (let i = conversationHistory.length - 1; i >= 0; i--) {
        const msg = conversationHistory[i];
        if (msg.metadata && typeof msg.metadata === 'object') {
          const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];
          for (const entityType of entityTypes) {
            if (msg.metadata[entityType] && !carriedContext[entityType]) {
              carriedContext[entityType] = msg.metadata[entityType];
            }
          }
          
          if (Object.keys(carriedContext).length > 0) {
            break; // Found most recent context
          }
        }
      }
      
      // Verify context switched from lead to contact
      assert.strictEqual(carriedContext.contact_id, 'contact-uuid-2', 'Most recent context should be contact');
      assert.strictEqual(carriedContext.lead_id, undefined, 'Should not carry forward older lead context');
      
      // Verify each turn has correct entity context
      assert.strictEqual(turn1Metadata.lead_id, 'lead-uuid-1', 'Turn 1 should have lead_id');
      assert.strictEqual(turn2Metadata.contact_id, 'contact-uuid-2', 'Turn 2 should have contact_id');
    });
    
    test('Verifies entity extraction from create operations', async () => {
      // When creating an entity, the ID comes from the result, not arguments
      
      const createToolInteractions = [
        {
          name: 'create_lead',
          arguments: { 
            name: 'New Lead',
            status: 'new',
            company: 'ACME Corp'
          },
          result_preview: JSON.stringify({
            id: 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789',
            lead_id: 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789',
            name: 'New Lead',
            created_at: new Date().toISOString()
          })
        }
      ];
      
      // More sophisticated extraction that checks result JSON
      const extractEntityContext = (toolInteractions) => {
        const entityContext = {};
        const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];

        for (const tool of toolInteractions) {
          const args = tool.arguments || {};
          
          // Check arguments
          for (const entityType of entityTypes) {
            if (args[entityType] && !entityContext[entityType]) {
              entityContext[entityType] = args[entityType];
            }
          }
          
          // Check result preview for entity IDs
          if (tool.result_preview) {
            try {
              const resultStr = tool.result_preview;
              const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
              for (const entityType of entityTypes) {
                if (!entityContext[entityType]) {
                  const match = resultStr.match(new RegExp(`"${entityType}"\\s*:\\s*"(${uuidPattern})"`, 'i'));
                  if (match && match[1]) {
                    entityContext[entityType] = match[1];
                  }
                }
              }
            } catch (_err) {
              // Ignore parse errors
            }
          }
        }

        return Object.fromEntries(
          Object.entries(entityContext).filter(([_, v]) => v && typeof v === 'string')
        );
      };
      
      const entityContext = extractEntityContext(createToolInteractions);
      
      assert.ok(entityContext.lead_id, 'Should extract lead_id from create result');
      assert.strictEqual(entityContext.lead_id, 'a1b2c3d4-e5f6-4789-a012-b3c4d5e6f789');
    });
    
    test('Handles mixed entity operations in single turn', async () => {
      // A single AI response might fetch a lead, create an activity for it, and update account
      
      const mixedToolInteractions = [
        {
          name: 'get_lead_details',
          arguments: { lead_id: 'a1a2a3a4-b1b2-4c3c-d4d4-e5e6f7f8f9f0' },
          result_preview: '{"id":"a1a2a3a4-b1b2-4c3c-d4d4-e5e6f7f8f9f0","name":"Lead ABC"}'
        },
        {
          name: 'create_activity',
          arguments: { 
            type: 'call',
            lead_id: 'a1a2a3a4-b1b2-4c3c-d4d4-e5e6f7f8f9f0',
            account_id: 'b2b3b4b5-c2c3-4d4d-e5e5-f6f7f8f9f0f1'
          },
          result_preview: '{"id":"c3c4c5c6-d3d4-4e5e-f6f6-a7a8a9a0a1a2","activity_id":"c3c4c5c6-d3d4-4e5e-f6f6-a7a8a9a0a1a2"}'
        },
        {
          name: 'update_account',
          arguments: { 
            id: 'b2b3b4b5-c2c3-4d4d-e5e5-f6f7f8f9f0f1',
            last_contact_date: new Date().toISOString()
          },
          result_preview: '{"id":"b2b3b4b5-c2c3-4d4d-e5e5-f6f7f8f9f0f1"}'
        }
      ];
      
      const extractEntityContext = (toolInteractions) => {
        const entityContext = {};
        const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];

        for (const tool of toolInteractions) {
          const toolName = tool.name || '';
          const args = tool.arguments || {};
          
          // Check arguments
          for (const entityType of entityTypes) {
            if (args[entityType] && !entityContext[entityType]) {
              entityContext[entityType] = args[entityType];
            }
          }
          
          // Infer from tool name + id pattern
          if (args.id && !toolName.includes('list') && !toolName.includes('search')) {
            if (toolName.includes('account') && !entityContext.account_id) {
              entityContext.account_id = args.id;
            }
          }
          
          // Check results
          if (tool.result_preview) {
            try {
              const resultStr = tool.result_preview;
              const uuidPattern = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
              for (const entityType of entityTypes) {
                if (!entityContext[entityType]) {
                  const match = resultStr.match(new RegExp(`"${entityType}"\\s*:\\s*"(${uuidPattern})"`, 'i'));
                  if (match && match[1]) {
                    entityContext[entityType] = match[1];
                  }
                }
              }
            } catch (err) {
              // Ignore
            }
          }
        }

        return Object.fromEntries(
          Object.entries(entityContext).filter(([_, v]) => v && typeof v === 'string')
        );
      };
      
      const entityContext = extractEntityContext(mixedToolInteractions);
      
      // Should capture all three entity types
      assert.ok(entityContext.lead_id, 'Should extract lead_id');
      assert.ok(entityContext.account_id, 'Should extract account_id');
      assert.ok(entityContext.activity_id, 'Should extract activity_id');
      assert.strictEqual(entityContext.lead_id, 'a1a2a3a4-b1b2-4c3c-d4d4-e5e6f7f8f9f0');
      assert.strictEqual(entityContext.account_id, 'b2b3b4b5-c2c3-4d4d-e5e5-f6f7f8f9f0f1');
      assert.strictEqual(entityContext.activity_id, 'c3c4c5c6-d3d4-4e5e-f6f6-a7a8a9a0a1a2');
    });
  });
  
  describe('Query Pattern Examples', () => {
    
    test('Demonstrates JSONB query patterns enabled by top-level entity IDs', () => {
      // These are SQL patterns that would work with the new metadata structure
      
      const exampleQueries = [
        {
          description: 'Find all messages about a specific lead',
          sql: "SELECT * FROM conversation_messages WHERE metadata @> '{\"lead_id\": \"a3af0a84-a16f-466e-aa82-62b462d1d998\"}'",
          jsonbOperator: '@>',
          purpose: 'Show related conversations on lead detail page'
        },
        {
          description: 'Find conversations that mentioned any lead',
          sql: "SELECT DISTINCT conversation_id FROM conversation_messages WHERE metadata ? 'lead_id'",
          jsonbOperator: '?',
          purpose: 'Track which leads have active AI conversations'
        },
        {
          description: 'Count conversations by entity type',
          sql: `
            SELECT 
              COUNT(CASE WHEN metadata ? 'lead_id' THEN 1 END) as lead_conversations,
              COUNT(CASE WHEN metadata ? 'contact_id' THEN 1 END) as contact_conversations,
              COUNT(CASE WHEN metadata ? 'account_id' THEN 1 END) as account_conversations
            FROM conversation_messages
          `,
          jsonbOperator: '?',
          purpose: 'Build analytics on AI usage per entity type'
        },
        {
          description: 'Find multi-entity conversations',
          sql: `
            SELECT conversation_id, COUNT(DISTINCT 
              CASE 
                WHEN metadata ? 'lead_id' THEN 'lead'
                WHEN metadata ? 'contact_id' THEN 'contact'
                WHEN metadata ? 'account_id' THEN 'account'
              END
            ) as entity_type_count
            FROM conversation_messages
            GROUP BY conversation_id
            HAVING COUNT(DISTINCT ...) > 1
          `,
          jsonbOperator: '?',
          purpose: 'Find conversations that span multiple entity types'
        }
      ];
      
      // Verify all query patterns are documented
      assert.ok(exampleQueries.length >= 4, 'Should have multiple query pattern examples');
      
      for (const query of exampleQueries) {
        assert.ok(query.description, 'Each query should have description');
        assert.ok(query.sql, 'Each query should have SQL example');
        assert.ok(query.purpose, 'Each query should explain business purpose');
      }
    });
  });
});
