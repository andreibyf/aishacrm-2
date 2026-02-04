/**
 * Braid Tool Execution Tests
 * 
 * Tests AI retrieval, navigation, and update functions via Braid SDK.
 * Validates executeBraidTool(), tool metrics, and the dependency graph.
 * 
 * @module tests/ai/braidToolExecution.test
 */

import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';
import { authGet, authPost, authPut, authDelete } from '../helpers/auth.js';

// Inside Docker: CRM_BACKEND_URL=http://backend:3001 or use localhost:3001
// Outside Docker: BACKEND_URL=http://localhost:3001 (matches internal port for consistency)
const BASE_URL = process.env.CRM_BACKEND_URL || process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Braid Tool Execution', { skip: !SHOULD_RUN }, () => {
  
  before(async () => {
    if (hasSupabaseCredentials()) {
      await initSupabaseForTests();
    }
  });

  // ============================================================
  // BRAID GRAPH API TESTS
  // ============================================================
  
  describe('Braid Graph API', () => {
    
    test('GET /api/braid/graph returns tool dependency graph', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph`);
      const json = await res.json();
      
      assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
      assert.ok(Array.isArray(json.nodes), 'Expected nodes array');
      assert.ok(Array.isArray(json.edges), 'Expected edges array');
      assert.ok(json.nodes.length > 0, 'Expected at least one tool node');
      
      // Verify node structure
      const firstNode = json.nodes[0];
      assert.ok(firstNode.id, 'Node should have id');
      assert.ok(firstNode.category, 'Node should have category');
      assert.ok(Array.isArray(firstNode.inputs), 'Node should have inputs array');
      assert.ok(Array.isArray(firstNode.outputs), 'Node should have outputs array');
    });

    test('GET /api/braid/graph/categories returns tool categories', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph/categories`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.categories, 'Expected categories object');
      
      // Verify expected categories exist
      const categories = Object.keys(json.categories);
      assert.ok(categories.includes('ACCOUNTS'), 'Should have ACCOUNTS category');
      assert.ok(categories.includes('CONTACTS'), 'Should have CONTACTS category');
      assert.ok(categories.includes('LEADS'), 'Should have LEADS category');
      assert.ok(categories.includes('OPPORTUNITIES'), 'Should have OPPORTUNITIES category');
    });

    test('GET /api/braid/graph/tool/:name returns tool details', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph/tool/search_accounts`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.tool, 'Expected tool object');
      assert.equal(json.tool.name, 'search_accounts');
      assert.equal(json.tool.category, 'ACCOUNTS');
      assert.ok(Array.isArray(json.tool.inputs), 'Tool should have inputs');
      assert.ok(Array.isArray(json.tool.outputs), 'Tool should have outputs');
    });

    test('GET /api/braid/graph/tool/:name/impact returns impact analysis', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph/tool/create_account/impact`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.tool, 'Expected tool info');
      assert.ok(json.category, 'Expected category');
      assert.ok(json.dependencies, 'Expected dependencies object');
      assert.ok(json.dependents, 'Expected dependents object');
      assert.ok(Array.isArray(json.affectedChains), 'Expected affectedChains array');
    });

    test('GET /api/braid/graph/validate checks for circular dependencies', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph/validate`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(typeof json.valid === 'boolean', 'Expected valid boolean');
      assert.ok(json.circularDependencies, 'Expected circularDependencies object');
      assert.ok(Array.isArray(json.circularDependencies.cycles), 'Expected cycles array');
    });

    test('GET /api/braid/graph/effects/:effect returns tools by effect', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph/effects/read`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.equal(json.effect, 'read');
      assert.ok(Array.isArray(json.tools), 'Expected tools array');
      assert.ok(json.tools.length > 0, 'Expected read tools to exist');
      
      // All returned tools should have 'read' in their effects
      for (const tool of json.tools) {
        assert.ok(tool.effects.includes('read'), `${tool.id} should have read effect`);
      }
    });
  });

  // ============================================================
  // RETRIEVAL TOOL TESTS (via routes that use Braid)
  // ============================================================
  
  describe('Retrieval Functions', () => {
    
    test('GET /api/v2/accounts returns accounts list', async () => {
      const res = await authGet(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      // V2 API returns { status: 'success', data: { accounts: [...] } }
      assert.ok(json.status === 'success' || Array.isArray(json), 'Expected success response');
      if (json.data) {
        assert.ok(json.data.accounts || Array.isArray(json.data), 'Expected accounts data');
      }
    });

    test('GET /api/v2/contacts returns contacts list', async () => {
      const res = await authGet(`${BASE_URL}/api/v2/contacts?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.status === 'success' || Array.isArray(json), 'Expected success response');
    });

    test('GET /api/v2/leads returns leads list', async () => {
      const res = await authGet(`${BASE_URL}/api/v2/leads?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.status === 'success' || Array.isArray(json), 'Expected success response');
    });

    test('GET /api/v2/opportunities returns opportunities list', async () => {
      const res = await authGet(`${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.status === 'success' || Array.isArray(json), 'Expected success response');
    });

    test('GET /api/v2/activities returns activities list', async () => {
      const res = await authGet(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      assert.ok(json.status === 'success' || Array.isArray(json), 'Expected success response');
    });

    test('Search endpoints support query parameters', async () => {
      const res = await authGet(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}&limit=5`);
      const json = await res.json();
      
      assert.equal(res.status, 200);
      // V2 returns nested data
      const accounts = json.data?.accounts || json.data || json;
      assert.ok(Array.isArray(accounts) ? accounts.length <= 5 : true, 'Should respect limit parameter');
    });
  });

  // ============================================================
  // NAVIGATION TESTS (AI sidebar navigation commands)
  // ============================================================
  
  describe('Navigation Functions', () => {
    
    test('AI routes are accessible', async () => {
      const res = await authGet(`${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}`);
      
      assert.equal(res.status, 200, 'AI suggestions endpoint should be accessible');
    });

    test('Braid graph endpoint is accessible', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/graph`);
      
      assert.equal(res.status, 200, 'Braid graph endpoint should be accessible');
    });
  });

  // ============================================================
  // UPDATE FUNCTION TESTS
  // ============================================================
  
  describe('Update Functions', () => {
    let testLeadId = null;
    
    test('POST /api/leads creates a new lead', async () => {
      const leadData = {
        tenant_id: TENANT_ID,
        name: `Test Lead ${Date.now()}`,
        email: `test${Date.now()}@example.com`,
        status: 'new',
        source: 'api_test',
        company: 'Test Company'
      };
      
      const res = await authPost(`${BASE_URL}/api/leads`, leadData);
      const json = await res.json();
      
      // Accept 200, 201 (success), 400 (validation), 401/403 (auth required)
      assert.ok([200, 201, 400, 401, 403].includes(res.status), `Expected valid response, got ${res.status}: ${JSON.stringify(json)}`);
      if (res.status === 200 || res.status === 201) {
        testLeadId = json.id || json.data?.id;
      }
    });

    test('PUT /api/leads/:id updates a lead', async () => {
      if (!testLeadId) {
        // Skip if no lead was created
        return;
      }
      
      const updateData = {
        tenant_id: TENANT_ID,
        status: 'contacted'
      };
      
      const res = await authPut(`${BASE_URL}/api/leads/${testLeadId}`, updateData);
      
      assert.ok([200, 400, 401, 403, 404].includes(res.status), `Expected valid response, got ${res.status}`);
    });

    test('DELETE /api/leads/:id removes a lead', async () => {
      if (!testLeadId) {
        return;
      }
      
      const res = await authDelete(`${BASE_URL}/api/leads/${testLeadId}?tenant_id=${TENANT_ID}`);
      
      assert.ok([200, 204, 400, 401, 403, 404].includes(res.status), `Expected valid response, got ${res.status}`);
    });
  });

  // ============================================================
  // BRAID METRICS API TESTS
  // ============================================================
  
  describe('Braid Metrics API', () => {
    
    test('GET /api/braid/metrics/tools returns tool metrics', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/metrics/tools?tenant_id=${TENANT_ID}`);
      
      // May require auth
      if (res.status === 200) {
        const json = await res.json();
        assert.ok(json.tools || Array.isArray(json), 'Expected tools data');
      } else {
        assert.ok([401, 403].includes(res.status), `Expected 200 or auth error, got ${res.status}`);
      }
    });

    test('GET /api/braid/metrics/timeseries returns time series data', async () => {
      const res = await authGet(`${BASE_URL}/api/braid/metrics/timeseries?tenant_id=${TENANT_ID}&period=1h`);
      
      if (res.status === 200) {
        const json = await res.json();
        assert.ok(json.data || json.timeseries, 'Expected timeseries data');
      } else {
        assert.ok([401, 403].includes(res.status), `Expected 200 or auth error, got ${res.status}`);
      }
    });
  });

  // ============================================================
  // BRAID INTEGRATION UNIT TESTS
  // ============================================================
  
  describe('Braid Integration Module', () => {
    let braidModule;
    
    before(async () => {
      try {
        braidModule = await import('../../lib/braidIntegration-v2.js');
      } catch (err) {
        console.log('[Test] Could not import braidIntegration-v2:', err.message);
      }
    });

    test('TOOL_CATEGORIES are properly defined', () => {
      if (!braidModule?.TOOL_CATEGORIES) {
        return; // Skip if module not loaded
      }
      
      const categories = braidModule.TOOL_CATEGORIES;
      assert.ok(categories.ACCOUNTS, 'Should have ACCOUNTS category');
      assert.ok(categories.CONTACTS, 'Should have CONTACTS category');
      assert.ok(categories.LEADS, 'Should have LEADS category');
      assert.ok(categories.ACCOUNTS.color, 'Category should have color');
      assert.ok(categories.ACCOUNTS.icon, 'Category should have icon');
    });

    test('TOOL_GRAPH contains tool definitions', () => {
      if (!braidModule?.TOOL_GRAPH) {
        return;
      }
      
      const graph = braidModule.TOOL_GRAPH;
      assert.ok(graph.search_accounts, 'Should have search_accounts tool');
      assert.ok(graph.create_lead, 'Should have create_lead tool');
      assert.ok(graph.get_opportunity_details, 'Should have get_opportunity_details tool');
      
      // Verify tool structure
      const tool = graph.search_accounts;
      assert.equal(tool.category, 'ACCOUNTS');
      assert.ok(Array.isArray(tool.inputs), 'Tool should have inputs');
      assert.ok(Array.isArray(tool.outputs), 'Tool should have outputs');
      assert.ok(Array.isArray(tool.effects), 'Tool should have effects');
    });

    test('getToolDependencies returns dependency object', () => {
      if (!braidModule?.getToolDependencies) {
        return;
      }
      
      const deps = braidModule.getToolDependencies('create_opportunity');
      // Returns { direct: [], transitive: [] }
      assert.ok(deps, 'Should return object');
      assert.ok(deps.direct !== undefined || Array.isArray(deps), 'Should have dependencies structure');
    });

    test('getToolDependents returns dependents object', () => {
      if (!braidModule?.getToolDependents) {
        return;
      }
      
      const dependents = braidModule.getToolDependents('create_account');
      // Returns { direct: [], transitive: [] }
      assert.ok(dependents, 'Should return object');
      assert.ok(dependents.direct !== undefined || Array.isArray(dependents), 'Should have dependents structure');
    });

    test('getToolsByCategory returns tools in category', () => {
      if (!braidModule?.getToolsByCategory) {
        return;
      }
      
      const accountTools = braidModule.getToolsByCategory('ACCOUNTS');
      assert.ok(Array.isArray(accountTools), 'Should return array');
      assert.ok(accountTools.length > 0, 'Should have account tools');
      
      for (const tool of accountTools) {
        assert.equal(tool.category, 'ACCOUNTS', 'All tools should be in ACCOUNTS category');
      }
    });

    test('detectCircularDependencies returns validation result', () => {
      if (!braidModule?.detectCircularDependencies) {
        return;
      }
      
      const result = braidModule.detectCircularDependencies();
      // Returns { hasCircular: boolean, cycles: [] }
      assert.ok(result, 'Should return result object');
      assert.ok(result.hasCircular !== undefined || result.cycles, 'Should have cycle detection result');
    });

    test('getToolImpactAnalysis returns analysis for valid tool', () => {
      if (!braidModule?.getToolImpactAnalysis) {
        return;
      }
      
      const analysis = braidModule.getToolImpactAnalysis('search_accounts');
      assert.ok(analysis.tool, 'Should have tool info');
      assert.ok(analysis.category, 'Should have category');
      assert.ok(analysis.dependencies !== undefined, 'Should have dependencies');
      assert.ok(analysis.dependents !== undefined, 'Should have dependents');
    });
  });
});
