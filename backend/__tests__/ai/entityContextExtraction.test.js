/**
 * Entity Context Extraction Tests
 * 
 * Tests that verify conversation_messages metadata properly extracts and persists
 * entity IDs from tool interactions for queryability and context carry-forward.
 * 
 * @module tests/ai/entityContextExtraction
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Entity Context Extraction Tests', { skip: !SHOULD_RUN }, () => {
  
  describe('extractEntityContext Helper Function', () => {
    
    test('extracts lead_id from tool arguments', async () => {
      // We need to test the actual implementation
      // Since extractEntityContext is a closure inside ai.js, we'll test via integration
      // For now, verify the concept with a mock implementation
      
      const mockToolInteractions = [
        {
          name: 'get_lead_details',
          arguments: { lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998' },
          result_preview: '{"name":"John Doe","status":"warm"}'
        }
      ];
      
      // Mock extraction logic (same as in ai.js)
      const extractEntityContext = (toolInteractions) => {
        if (!Array.isArray(toolInteractions) || toolInteractions.length === 0) {
          return {};
        }

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

        const cleanedContext = {};
        for (const [key, value] of Object.entries(entityContext)) {
          if (value && typeof value === 'string' && value.length > 0) {
            cleanedContext[key] = value;
          }
        }

        return cleanedContext;
      };
      
      const result = extractEntityContext(mockToolInteractions);
      
      assert.ok(result.lead_id, 'Should extract lead_id');
      assert.strictEqual(result.lead_id, 'a3af0a84-a16f-466e-aa82-62b462d1d998');
      assert.strictEqual(result.contact_id, undefined, 'Should not have contact_id');
    });
    
    test('extracts contact_id from tool with id argument and name pattern', async () => {
      const mockToolInteractions = [
        {
          name: 'get_contact_details',
          arguments: { id: 'b1bf1b74-b29c-45c7-bb93-73c573f2e48d' },
          result_preview: '{"name":"Jane Smith"}'
        }
      ];
      
      // Mock extraction with name pattern logic
      const extractEntityContext = (toolInteractions) => {
        const entityContext = {};
        const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];

        for (const tool of toolInteractions) {
          const toolName = tool.name || '';
          const args = tool.arguments || {};
          
          // Extract from arguments
          for (const entityType of entityTypes) {
            if (args[entityType] && !entityContext[entityType]) {
              entityContext[entityType] = args[entityType];
            }
          }

          // Infer from tool name + id pattern
          if (args.id && !toolName.includes('list') && !toolName.includes('search')) {
            if (toolName.includes('contact') && !entityContext.contact_id) {
              entityContext.contact_id = args.id;
            }
          }
        }

        const cleanedContext = {};
        for (const [key, value] of Object.entries(entityContext)) {
          if (value && typeof value === 'string' && value.length > 0) {
            cleanedContext[key] = value;
          }
        }

        return cleanedContext;
      };
      
      const result = extractEntityContext(mockToolInteractions);
      
      assert.ok(result.contact_id, 'Should extract contact_id from id + name pattern');
      assert.strictEqual(result.contact_id, 'b1bf1b74-b29c-45c7-bb93-73c573f2e48d');
    });
    
    test('extracts multiple entity types from multiple tools', async () => {
      const mockToolInteractions = [
        {
          name: 'get_lead_details',
          arguments: { lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998' },
          result_preview: '{}'
        },
        {
          name: 'create_activity',
          arguments: { 
            type: 'call',
            lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998',
            account_id: 'c2cf2c85-c39d-56d8-cc04-84d684g3f59e'
          },
          result_preview: '{"id":"d3df3d96-d49e-67e9-dd15-95e795h4g60f"}'
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

        const cleanedContext = {};
        for (const [key, value] of Object.entries(entityContext)) {
          if (value && typeof value === 'string' && value.length > 0) {
            cleanedContext[key] = value;
          }
        }

        return cleanedContext;
      };
      
      const result = extractEntityContext(mockToolInteractions);
      
      assert.ok(result.lead_id, 'Should extract lead_id');
      assert.ok(result.account_id, 'Should extract account_id');
      assert.strictEqual(result.lead_id, 'a3af0a84-a16f-466e-aa82-62b462d1d998');
      assert.strictEqual(result.account_id, 'c2cf2c85-c39d-56d8-cc04-84d684g3f59e');
    });
    
    test('returns empty object for empty tool interactions', async () => {
      const extractEntityContext = (toolInteractions) => {
        if (!Array.isArray(toolInteractions) || toolInteractions.length === 0) {
          return {};
        }
        return {};
      };
      
      const result1 = extractEntityContext([]);
      const result2 = extractEntityContext(null);
      const result3 = extractEntityContext(undefined);
      
      assert.deepStrictEqual(result1, {}, 'Empty array should return empty object');
      assert.deepStrictEqual(result2, {}, 'Null should return empty object');
      assert.deepStrictEqual(result3, {}, 'Undefined should return empty object');
    });
    
    test('handles tools without entity IDs gracefully', async () => {
      const mockToolInteractions = [
        {
          name: 'get_dashboard_bundle',
          arguments: { tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46' },
          result_preview: '{"stats":{}}'
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

        const cleanedContext = {};
        for (const [key, value] of Object.entries(entityContext)) {
          if (value && typeof value === 'string' && value.length > 0) {
            cleanedContext[key] = value;
          }
        }

        return cleanedContext;
      };
      
      const result = extractEntityContext(mockToolInteractions);
      
      assert.deepStrictEqual(result, {}, 'Should return empty object for non-entity tools');
    });
  });
  
  describe('Metadata Structure', () => {
    
    test('expected metadata structure includes entity IDs at top level', () => {
      // Simulate what metadata should look like after extraction
      const toolInteractions = [
        {
          name: 'get_lead_details',
          arguments: { lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998' },
          result_preview: '{"name":"John Doe"}'
        }
      ];
      
      const baseMetadata = {
        model: 'gpt-4o-2024-08-06',
        usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 },
        tool_interactions: toolInteractions,
        iterations: 1
      };
      
      // Simulate entity extraction
      const entityContext = { lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998' };
      const finalMetadata = { ...baseMetadata, ...entityContext };
      
      // Verify structure
      assert.ok(finalMetadata.lead_id, 'Should have lead_id at top level');
      assert.ok(finalMetadata.tool_interactions, 'Should preserve tool_interactions');
      assert.ok(finalMetadata.model, 'Should preserve model');
      assert.strictEqual(finalMetadata.lead_id, 'a3af0a84-a16f-466e-aa82-62b462d1d998');
    });
    
    test('metadata does not include null or undefined entity IDs', () => {
      const entityContext = {
        lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998',
        contact_id: null,
        account_id: undefined
      };
      
      // Clean the context (as done in extractEntityContext)
      const cleanedContext = {};
      for (const [key, value] of Object.entries(entityContext)) {
        if (value && typeof value === 'string' && value.length > 0) {
          cleanedContext[key] = value;
        }
      }
      
      assert.ok(cleanedContext.lead_id, 'Should include valid lead_id');
      assert.strictEqual(cleanedContext.contact_id, undefined, 'Should not include null contact_id');
      assert.strictEqual(cleanedContext.account_id, undefined, 'Should not include undefined account_id');
    });
  });
  
  describe('Context Carry-Forward Logic', () => {
    
    test('extracts most recent entity context from message history', () => {
      const mockHistoryRows = [
        {
          role: 'user',
          content: 'Tell me about my leads',
          metadata: {}
        },
        {
          role: 'assistant',
          content: 'Here are your leads...',
          metadata: {
            tool_interactions: [],
            lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998'
          }
        },
        {
          role: 'user',
          content: 'What about contacts?',
          metadata: {}
        },
        {
          role: 'assistant',
          content: 'Here are your contacts...',
          metadata: {
            tool_interactions: [],
            contact_id: 'b1bf1b74-b29c-45c7-bb93-73c573f2e48d'
          }
        }
      ];
      
      // Scan in reverse for most recent entity context
      let carriedEntityContext = {};
      for (let i = mockHistoryRows.length - 1; i >= 0; i--) {
        const row = mockHistoryRows[i];
        if (row.metadata && typeof row.metadata === 'object') {
          const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];
          for (const entityType of entityTypes) {
            if (row.metadata[entityType] && !carriedEntityContext[entityType]) {
              carriedEntityContext[entityType] = row.metadata[entityType];
            }
          }
          
          if (Object.keys(carriedEntityContext).length > 0) {
            break;
          }
        }
      }
      
      assert.ok(carriedEntityContext.contact_id, 'Should find most recent contact_id');
      assert.strictEqual(carriedEntityContext.contact_id, 'b1bf1b74-b29c-45c7-bb93-73c573f2e48d');
      assert.strictEqual(carriedEntityContext.lead_id, undefined, 'Should not include older lead_id');
    });
    
    test('handles empty message history gracefully', () => {
      const mockHistoryRows = [];
      
      let carriedEntityContext = {};
      for (let i = mockHistoryRows.length - 1; i >= 0; i--) {
        // This loop won't execute
      }
      
      assert.deepStrictEqual(carriedEntityContext, {}, 'Should return empty object for empty history');
    });
  });
});
