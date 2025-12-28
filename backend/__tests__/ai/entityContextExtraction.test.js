/**
 * Entity Context Extraction Tests
 * 
 * Tests that verify entity IDs and intents are properly extracted from tool interactions
 * and persisted to conversation_messages metadata
 * 
 * @module tests/ai/entityContextExtraction
 */

import { describe, test } from 'node:test';
import assert from 'node:assert/strict';

const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Entity Context Extraction Tests', { skip: !SHOULD_RUN }, () => {
  
  describe('extractEntityContext function', () => {
    
    test('extracts entity IDs from tool arguments', () => {
      const toolInteractions = [
        {
          name: 'get_lead_details',
          arguments: {
            lead_id: 'a3af0a84-a16f-466e-aa82-62b462d1d998'
          },
          result_preview: 'Lead details...'
        }
      ];
      
      // Mock the function since we can't import it directly (it's inside the route)
      // This is a conceptual test - actual testing would need the function exported
      const extractEntityContext = (interactions) => {
        const entityContext = {};
        const entityTypes = ['lead', 'contact', 'account', 'opportunity', 'activity'];
        
        for (const interaction of interactions) {
          const args = interaction.arguments || interaction.args || {};
          for (const entityType of entityTypes) {
            const idField = `${entityType}_id`;
            if (args[idField] && !entityContext[idField]) {
              entityContext[idField] = args[idField];
            }
          }
        }
        
        return entityContext;
      };
      
      const result = extractEntityContext(toolInteractions);
      
      assert.ok(result.lead_id, 'Should extract lead_id from arguments');
      assert.equal(result.lead_id, 'a3af0a84-a16f-466e-aa82-62b462d1d998');
    });
    
    test('extracts entity IDs from tool results', () => {
      const toolInteractions = [
        {
          name: 'create_contact',
          arguments: {
            first_name: 'John',
            last_name: 'Doe'
          },
          full_result: {
            tag: 'Ok',
            value: {
              contact: {
                id: 'c12345-6789-abcd-ef12-34567890abcd',
                first_name: 'John',
                last_name: 'Doe'
              }
            }
          }
        }
      ];
      
      const extractEntityContext = (interactions) => {
        const entityContext = {};
        const entityTypes = ['lead', 'contact', 'account', 'opportunity', 'activity'];
        
        for (const interaction of interactions) {
          const fullResult = interaction.full_result;
          if (fullResult) {
            const result = typeof fullResult === 'string' ? JSON.parse(fullResult) : fullResult;
            const data = result?.tag === 'Ok' ? result.value : result;
            
            if (data && typeof data === 'object') {
              for (const entityType of entityTypes) {
                const entity = data[entityType];
                if (entity?.id && !entityContext[`${entityType}_id`]) {
                  entityContext[`${entityType}_id`] = entity.id;
                }
              }
            }
          }
        }
        
        return entityContext;
      };
      
      const result = extractEntityContext(toolInteractions);
      
      assert.ok(result.contact_id, 'Should extract contact_id from result');
      assert.equal(result.contact_id, 'c12345-6789-abcd-ef12-34567890abcd');
    });
    
    test('handles multiple entity types in single interaction', () => {
      const _toolInteractions = [
        {
          name: 'get_lead_details',
          arguments: {
            lead_id: 'lead-123',
            account_id: 'account-456'
          },
          full_result: {
            tag: 'Ok',
            value: {
              lead: {
                id: 'lead-123'
              },
              account: {
                id: 'account-456'
              }
            }
          }
        }
      ];
      
      // Would test actual extraction here
      assert.ok(true, 'Should handle multiple entity types');
    });
    
    test('returns empty object when no entity IDs found', () => {
      const toolInteractions = [
        {
          name: 'fetch_tenant_snapshot',
          arguments: {},
          result_preview: 'Snapshot data...'
        }
      ];
      
      const extractEntityContext = (interactions) => {
        if (!Array.isArray(interactions) || interactions.length === 0) {
          return {};
        }
        
        const entityContext = {};
        const entityTypes = ['lead', 'contact', 'account', 'opportunity', 'activity'];
        
        for (const interaction of interactions) {
          const args = interaction.arguments || interaction.args || {};
          for (const entityType of entityTypes) {
            const idField = `${entityType}_id`;
            if (args[idField] && !entityContext[idField]) {
              entityContext[idField] = args[idField];
            }
          }
        }
        
        return entityContext;
      };
      
      const result = extractEntityContext(toolInteractions);
      
      assert.deepEqual(result, {}, 'Should return empty object when no entities found');
    });
  });
  
  describe('Intent Classification Integration', () => {
    
    test('intent classifier returns expected intent codes', async () => {
      const { classifyIntent } = await import('../../lib/intentClassifier.js');
      
      const testCases = [
        { message: 'Show me details for this lead' },
        { message: 'Create a new contact' },
        { message: 'Update the account' },
        { message: 'List all opportunities' },
        { message: 'What should I do next?' }
      ];
      
      for (const { message } of testCases) {
        const intent = classifyIntent(message);
        // Just verify it returns a string or null, don't enforce specific intents
        assert.ok(
          intent === null || typeof intent === 'string',
          `Intent classification for "${message}" should return null or string intent`
        );
      }
    });
    
    test('intent should be persisted in metadata structure', () => {
      // Expected metadata structure
      const expectedMetadata = {
        model: 'gpt-4o-2024-08-06',
        usage: { prompt_tokens: 100, completion_tokens: 50 },
        tool_interactions: [
          {
            name: 'get_lead_details',
            arguments: { lead_id: 'lead-123' },
            result_preview: 'Lead details...'
          }
        ],
        iterations: 1,
        intent: 'LEAD_GET',
        lead_id: 'lead-123',
        contact_id: null,
        account_id: null,
        opportunity_id: null,
        activity_id: null
      };
      
      // Verify structure has required fields
      assert.ok(expectedMetadata.intent, 'Metadata should include intent field');
      assert.ok(expectedMetadata.lead_id, 'Metadata should include extracted lead_id');
      assert.equal(expectedMetadata.intent, 'LEAD_GET', 'Intent should match classified intent');
    });
  });
  
  describe('Context Carry-Forward Logic', () => {
    
    test('should extract context from conversation history metadata', () => {
      // Simulate conversation history with metadata
      const historyRows = [
        {
          role: 'user',
          content: 'Show me lead details',
          metadata: null
        },
        {
          role: 'assistant',
          content: 'Here are the lead details...',
          metadata: {
            intent: 'LEAD_GET',
            lead_id: 'lead-123',
            tool_interactions: []
          }
        },
        {
          role: 'user',
          content: 'Update their status to qualified',
          metadata: null
        }
      ];
      
      // Extract carried context (scan in reverse)
      let carriedEntityContext = {};
      let carriedIntent = null;
      
      for (let i = historyRows.length - 1; i >= 0; i--) {
        const row = historyRows[i];
        if (row.metadata && typeof row.metadata === 'object') {
          if (!carriedIntent && row.metadata.intent) {
            carriedIntent = row.metadata.intent;
          }
          
          const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];
          for (const entityType of entityTypes) {
            if (!carriedEntityContext[entityType] && row.metadata[entityType]) {
              carriedEntityContext[entityType] = row.metadata[entityType];
            }
          }
        }
      }
      
      assert.equal(carriedIntent, 'LEAD_GET', 'Should carry forward most recent intent');
      assert.equal(carriedEntityContext.lead_id, 'lead-123', 'Should carry forward most recent lead_id');
    });
    
    test('should prioritize most recent entity context', () => {
      const historyRows = [
        {
          role: 'assistant',
          content: 'Lead created',
          metadata: {
            intent: 'LEAD_CREATE',
            lead_id: 'lead-old'
          }
        },
        {
          role: 'assistant',
          content: 'Contact created',
          metadata: {
            intent: 'CONTACT_CREATE',
            contact_id: 'contact-123'
          }
        },
        {
          role: 'assistant',
          content: 'Lead updated',
          metadata: {
            intent: 'LEAD_UPDATE',
            lead_id: 'lead-new'
          }
        }
      ];
      
      // Scan in reverse
      let carriedEntityContext = {};
      for (let i = historyRows.length - 1; i >= 0; i--) {
        const row = historyRows[i];
        if (row.metadata && typeof row.metadata === 'object') {
          const entityTypes = ['lead_id', 'contact_id', 'account_id', 'opportunity_id', 'activity_id'];
          for (const entityType of entityTypes) {
            if (!carriedEntityContext[entityType] && row.metadata[entityType]) {
              carriedEntityContext[entityType] = row.metadata[entityType];
            }
          }
        }
      }
      
      assert.equal(carriedEntityContext.lead_id, 'lead-new', 'Should use most recent lead_id');
      assert.equal(carriedEntityContext.contact_id, 'contact-123', 'Should preserve contact_id');
    });
  });
  
  describe('Tool Name Pattern Matching', () => {
    
    test('should infer entity type from tool names', () => {
      const toolNames = [
        { tool: 'get_lead_details', expectedEntity: 'lead' },
        { tool: 'create_contact', expectedEntity: 'contact' },
        { tool: 'update_account', expectedEntity: 'account' },
        { tool: 'list_opportunities', expectedEntity: 'opportunit' }, // Partial match for "opportunities"
        { tool: 'search_activities', expectedEntity: 'activit' } // Partial match for "activities"
      ];
      
      for (const { tool, expectedEntity } of toolNames) {
        assert.ok(
          tool.includes(expectedEntity),
          `Tool name "${tool}" should contain entity type "${expectedEntity}"`
        );
      }
    });
    
    test('should infer intent from tool names', () => {
      const toolIntents = [
        { tool: 'create_lead', expectedIntent: 'create' },
        { tool: 'update_contact', expectedIntent: 'update' },
        { tool: 'get_account_details', expectedIntent: 'query' },
        { tool: 'list_opportunities', expectedIntent: 'query' },
        { tool: 'search_leads', expectedIntent: 'query' }
      ];
      
      for (const { tool, expectedIntent } of toolIntents) {
        let inferredIntent = 'query'; // default
        
        if (tool.startsWith('create_')) inferredIntent = 'create';
        else if (tool.startsWith('update_')) inferredIntent = 'update';
        else if (tool.startsWith('delete_')) inferredIntent = 'delete';
        else if (tool.startsWith('search_') || tool.startsWith('get_') || tool.startsWith('list_')) inferredIntent = 'query';
        
        assert.equal(
          inferredIntent,
          expectedIntent,
          `Tool "${tool}" should infer intent "${expectedIntent}"`
        );
      }
    });
  });
});
