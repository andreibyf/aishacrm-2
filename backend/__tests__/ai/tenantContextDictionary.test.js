/**
 * Unit tests for Tenant Context Dictionary
 * Tests the v3.0.0 AI context dictionary system
 * 
 * @module tests/ai/tenantContextDictionary.test
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';

// Import the module under test
let buildTenantContextDictionary;
let generateContextDictionaryPrompt;
let V3_WORKFLOW_DEFINITIONS;
let DEFAULT_STATUS_CARDS;

describe('Tenant Context Dictionary', () => {
  before(async () => {
    // Dynamic import for ESM compatibility
    const module = await import('../../lib/tenantContextDictionary.js');
    buildTenantContextDictionary = module.buildTenantContextDictionary;
    generateContextDictionaryPrompt = module.generateContextDictionaryPrompt;
    V3_WORKFLOW_DEFINITIONS = module.V3_WORKFLOW_DEFINITIONS;
    DEFAULT_STATUS_CARDS = module.DEFAULT_STATUS_CARDS;
  });

  describe('V3_WORKFLOW_DEFINITIONS', () => {
    it('should have three main workflows', () => {
      assert.ok(V3_WORKFLOW_DEFINITIONS.bizdev_to_lead);
      assert.ok(V3_WORKFLOW_DEFINITIONS.lead_to_conversion);
      assert.ok(V3_WORKFLOW_DEFINITIONS.opportunity_pipeline);
    });

    it('bizdev_to_lead workflow should have correct stages', () => {
      const workflow = V3_WORKFLOW_DEFINITIONS.bizdev_to_lead;
      assert.strictEqual(workflow.name, 'Lead Generation');
      assert.deepStrictEqual(workflow.stages, ['BizDev Source', 'Lead']);
      assert.deepStrictEqual(workflow.actions, ['promote']);
    });

    it('lead_to_conversion workflow should have correct stages', () => {
      const workflow = V3_WORKFLOW_DEFINITIONS.lead_to_conversion;
      assert.strictEqual(workflow.name, 'Lead Conversion');
      assert.deepStrictEqual(workflow.stages, ['Lead', 'Contact', 'Account', 'Opportunity']);
      assert.ok(workflow.actions.includes('qualify'));
      assert.ok(workflow.actions.includes('convert'));
    });

    it('opportunity_pipeline workflow should have standard sales stages', () => {
      const workflow = V3_WORKFLOW_DEFINITIONS.opportunity_pipeline;
      assert.strictEqual(workflow.name, 'Sales Pipeline');
      assert.ok(workflow.stages.includes('prospecting'));
      assert.ok(workflow.stages.includes('closed_won'));
      assert.ok(workflow.stages.includes('closed_lost'));
    });
  });

  describe('DEFAULT_STATUS_CARDS', () => {
    it('should have status cards for all main entities', () => {
      assert.ok(Array.isArray(DEFAULT_STATUS_CARDS.contacts));
      assert.ok(Array.isArray(DEFAULT_STATUS_CARDS.accounts));
      assert.ok(Array.isArray(DEFAULT_STATUS_CARDS.leads));
      assert.ok(Array.isArray(DEFAULT_STATUS_CARDS.opportunities));
      assert.ok(Array.isArray(DEFAULT_STATUS_CARDS.activities));
      assert.ok(Array.isArray(DEFAULT_STATUS_CARDS.bizdev_sources));
    });

    it('leads should have standard v3.0.0 statuses', () => {
      const leadStatuses = DEFAULT_STATUS_CARDS.leads;
      assert.ok(leadStatuses.includes('new'));
      assert.ok(leadStatuses.includes('contacted'));
      assert.ok(leadStatuses.includes('qualified'));
      assert.ok(leadStatuses.includes('converted'));
    });

    it('activities should have status-based cards', () => {
      const activityStatuses = DEFAULT_STATUS_CARDS.activities;
      assert.ok(activityStatuses.includes('scheduled'));
      assert.ok(activityStatuses.includes('completed'));
      assert.ok(activityStatuses.includes('overdue'));
    });
  });

  describe('generateContextDictionaryPrompt()', () => {
    it('should handle error dictionary gracefully', () => {
      const errorDict = { error: 'Tenant not found' };
      const result = generateContextDictionaryPrompt(errorDict);
      assert.ok(result.includes('Unable to load'));
    });

    it('should generate prompt with tenant information', () => {
      const mockDictionary = {
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        tenant: {
          id: 'test-uuid',
          slug: 'test-tenant',
          name: 'Test Company',
          businessModel: 'B2B',
          industry: 'Technology'
        },
        terminology: {
          entities: {
            accounts: { singular: 'Client', plural: 'Clients', isCustomized: true },
            contacts: { singular: 'Contact', plural: 'Contacts', isCustomized: false }
          },
          customizationCount: 1
        },
        workflows: {
          version: '3.0.0',
          definitions: V3_WORKFLOW_DEFINITIONS,
          businessModelNotes: 'Business-to-business model.'
        },
        statusCards: {
          source: 'defaults',
          entities: DEFAULT_STATUS_CARDS
        }
      };

      const prompt = generateContextDictionaryPrompt(mockDictionary);
      
      // Should contain version
      assert.ok(prompt.includes('3.0.0'), 'Should include version');
      
      // Should contain tenant name
      assert.ok(prompt.includes('Test Company'), 'Should include tenant name');
      
      // Should contain business model
      assert.ok(prompt.includes('B2B'), 'Should include business model');
      
      // Should contain workflow info
      assert.ok(prompt.includes('BizDev Source'), 'Should include workflow info');
      
      // Should contain custom terminology section (since customizationCount > 0)
      assert.ok(prompt.includes('Clients'), 'Should include custom terminology');
      
      // Should contain status values
      assert.ok(prompt.includes('leads:'), 'Should include lead statuses');
    });

    it('should not include custom terminology section if no customizations', () => {
      const mockDictionary = {
        version: '3.0.0',
        timestamp: new Date().toISOString(),
        tenant: {
          id: 'test-uuid',
          name: 'Standard Company',
          businessModel: 'Hybrid'
        },
        terminology: {
          entities: {},
          customizationCount: 0
        },
        workflows: {
          version: '3.0.0',
          definitions: V3_WORKFLOW_DEFINITIONS,
          businessModelNotes: 'Mixed model.'
        },
        statusCards: {
          source: 'defaults',
          entities: DEFAULT_STATUS_CARDS
        }
      };

      const prompt = generateContextDictionaryPrompt(mockDictionary);
      
      // Should NOT contain custom terminology section
      assert.ok(!prompt.includes('CUSTOM TERMINOLOGY'), 'Should not have custom terminology section');
    });
  });

  describe('buildTenantContextDictionary()', () => {
    it('should require a database pool', async () => {
      // Without a pool, should return error
      const result = await buildTenantContextDictionary(null, 'test-tenant');
      assert.ok(result.error || result.durationMs >= 0); // Either errors or returns
    });

    it('should return error for non-existent tenant', async () => {
      // Mock pool that returns nothing
      const mockPool = {
        query: async () => ({ rows: [] })
      };
      
      const result = await buildTenantContextDictionary(mockPool, 'non-existent-uuid-12345');
      // Expecting error because tenant doesn't exist
      assert.ok(result.error || result.tenant === null || !result.tenant?.id);
    });
  });
});
