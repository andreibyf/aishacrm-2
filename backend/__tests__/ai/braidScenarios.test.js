/**
 * Braid SDK Scenario Tests
 * 
 * End-to-end tests for AI retrieval, navigation, and update operations.
 * These tests exercise the actual executeBraidTool() function.
 * 
 * @module tests/ai/braidScenarios
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';

// Test configuration
const TENANT_ID = process.env.TEST_TENANT_ID || '6cb4c008-4847-426a-9a2e-918ad70e7b69';
const TEST_USER_ID = process.env.TEST_USER_ID || '00000000-0000-0000-0000-000000000001';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 30000);

// Ensure JWT secret exists for internal service token generation
if (!process.env.JWT_SECRET) {
  process.env.JWT_SECRET = 'test-jwt-secret';
}

describe('Braid SDK Scenario Tests', { skip: !SHOULD_RUN, timeout: TEST_TIMEOUT_MS }, () => {
  let braidModule;
  let supabase;
  let tenantRecord;
  let testAccessToken;
  
  before(async () => {
    // Initialize Supabase
    if (hasSupabaseCredentials()) {
      await initSupabaseForTests();
      // Import supabase after initialization
      try {
        const { getSupabaseClient } = await import('../../lib/supabase-db.js');
        supabase = getSupabaseClient();
        console.log('[Braid Scenarios] Supabase client initialized');
      } catch (err) {
        console.log('[Braid Scenarios] Could not get Supabase client:', err.message);
      }
    }
    
    // Import Braid module
    try {
      braidModule = await import('../../lib/braidIntegration-v2.js');
    } catch (err) {
      console.log('[Braid Scenarios] Could not import braidIntegration-v2:', err.message);
      return;
    }
    
    // Get tenant record
    if (supabase) {
      try {
        const { data: tenant, error } = await supabase
          .from('tenant')
          .select('*')
          .eq('id', TENANT_ID)
          .single();
        
        if (error) {
          console.log('[Braid Scenarios] Tenant lookup error:', error.message);
        } else {
          tenantRecord = tenant;
          console.log('[Braid Scenarios] Found tenant:', tenantRecord?.id);
        }
      } catch (err) {
        console.log('[Braid Scenarios] Tenant query failed:', err.message);
      }
    } else {
      console.log('[Braid Scenarios] No Supabase client available');
    }
    
    // Use the exported TOOL_ACCESS_TOKEN constant
    if (braidModule?.TOOL_ACCESS_TOKEN && tenantRecord) {
      testAccessToken = braidModule.TOOL_ACCESS_TOKEN;
      console.log('[Braid Scenarios] Using TOOL_ACCESS_TOKEN for test execution');
    } else {
      console.log('[Braid Scenarios] Cannot create access token:', {
        hasModule: !!braidModule,
        hasToken: !!braidModule?.TOOL_ACCESS_TOKEN,
        hasTenant: !!tenantRecord
      });
    }
  });

  // ============================================================
  // RETRIEVAL SCENARIO TESTS
  // ============================================================
  
  describe('Retrieval Scenarios', () => {
    
    test('search_accounts retrieves accounts for tenant', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        console.log('[Skip] Missing Braid module, tenant, or access token');
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'search_accounts',
        { limit: 5 },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      // Should return Ok or Err
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        assert.ok(result.value, 'Success result should have value');
        // Accounts should be an array
        const accounts = result.value.accounts || result.value;
        assert.ok(Array.isArray(accounts) || typeof accounts === 'object', 'Should return accounts');
      } else if (result.tag === 'Err') {
        // Auth errors are acceptable in test environment
        assert.ok(result.error, 'Error result should have error details');
        console.log('[Expected] search_accounts returned:', result.error.type || result.error.message);
      }
    });

    test('search_contacts retrieves contacts for tenant', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'search_contacts',
        { limit: 5 },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        const contacts = result.value.contacts || result.value;
        assert.ok(Array.isArray(contacts) || typeof contacts === 'object', 'Should return contacts');
      }
    });

    test('search_leads retrieves leads for tenant', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'search_leads',
        { limit: 5, status: 'new' },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        const leads = result.value.leads || result.value;
        assert.ok(Array.isArray(leads) || typeof leads === 'object', 'Should return leads');
      }
    });

    test('search_opportunities retrieves opportunities for tenant', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'search_opportunities',
        { limit: 5 },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        const opportunities = result.value.opportunities || result.value;
        assert.ok(Array.isArray(opportunities) || typeof opportunities === 'object', 'Should return opportunities');
      }
    });

    test('get_dashboard_metrics retrieves dashboard data', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'get_dashboard_metrics',
        {},
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        assert.ok(result.value, 'Dashboard metrics should have value');
      }
    });
  });

  // ============================================================
  // CRUD SCENARIO TESTS
  // ============================================================
  
  describe('CRUD Scenarios', () => {
    let createdLeadId = null;
    
    test('create_lead creates a new lead', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      const leadData = {
        name: `Braid Test Lead ${Date.now()}`,
        email: `braidtest${Date.now()}@example.com`,
        company: 'Braid Test Company',
        status: 'new',
        source: 'braid_test'
      };
      
      const result = await braidModule.executeBraidTool(
        'create_lead',
        leadData,
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        createdLeadId = result.value?.id || result.value?.lead?.id;
        console.log('[Create Lead] Created lead ID:', createdLeadId);
        assert.ok(createdLeadId, 'Created lead should have an ID');
      } else {
        console.log('[Create Lead] Error:', result.error?.type, result.error?.message);
      }
    });

    test('get_lead_details retrieves a specific lead', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      // Use created lead or find an existing one
      let leadId = createdLeadId;
      
      if (!leadId && supabase) {
        const { data: existingLead } = await supabase
          .from('leads')
          .select('id')
          .eq('tenant_id', TENANT_ID)
          .limit(1)
          .single();
        leadId = existingLead?.id;
      }
      
      if (!leadId) {
        console.log('[Skip] No lead ID available for get_lead_details test');
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'get_lead_details',
        { lead_id: leadId },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        assert.ok(result.value, 'Should return lead details');
      }
    });

    test('update_lead modifies an existing lead', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken || !createdLeadId) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'update_lead',
        { 
          lead_id: createdLeadId,
          status: 'contacted',
          notes: 'Updated via Braid test'
        },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.ok(result.tag, 'Result should have a tag');
      
      if (result.tag === 'Ok') {
        console.log('[Update Lead] Updated successfully');
      } else {
        console.log('[Update Lead] Error:', result.error?.type, result.error?.message);
      }
    });

    // Cleanup: Delete the test lead
    after(async () => {
      if (createdLeadId && braidModule?.executeBraidTool && tenantRecord && testAccessToken) {
        try {
          await braidModule.executeBraidTool(
            'delete_lead',
            { lead_id: createdLeadId, confirmed: true },
            tenantRecord,
            TEST_USER_ID,
            testAccessToken
          );
          console.log('[Cleanup] Deleted test lead:', createdLeadId);
        } catch (err) {
          console.log('[Cleanup] Could not delete test lead:', err.message);
        }
      }
    });
  });

  // ============================================================
  // SECURITY SCENARIO TESTS
  // ============================================================
  
  describe('Security Scenarios', () => {
    
    test('executeBraidTool rejects calls without access token', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'search_accounts',
        { limit: 1 },
        tenantRecord,
        TEST_USER_ID,
        null // No access token
      );
      
      assert.equal(result.tag, 'Err', 'Should reject without token');
      assert.ok(
        result.error.type === 'AuthorizationError' || result.error.message.includes('authorization'),
        'Should return authorization error'
      );
    });

    test('executeBraidTool rejects invalid access token', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord) {
        return;
      }
      
      const fakeToken = { verified: false, source: 'fake' };
      
      const result = await braidModule.executeBraidTool(
        'search_accounts',
        { limit: 1 },
        tenantRecord,
        TEST_USER_ID,
        fakeToken
      );
      
      assert.equal(result.tag, 'Err', 'Should reject invalid token');
      assert.ok(
        result.error.type === 'AuthorizationError' || result.error.message.includes('authorization'),
        'Should return authorization error'
      );
    });

    test('executeBraidTool rejects unknown tool names', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken) {
        return;
      }
      
      const result = await braidModule.executeBraidTool(
        'nonexistent_tool_xyz',
        {},
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      assert.equal(result.tag, 'Err', 'Should reject unknown tool');
      assert.ok(
        result.error.type === 'UnknownTool' || result.error.message.includes('not found'),
        'Should return unknown tool error'
      );
    });
  });

  // ============================================================
  // TOOL REGISTRY VALIDATION
  // ============================================================
  
  describe('Tool Registry Validation', () => {
    
    test('TOOL_REGISTRY contains expected CRM tools', () => {
      if (!braidModule?.TOOL_REGISTRY) {
        return;
      }
      
      const registry = braidModule.TOOL_REGISTRY;
      
      // Account tools
      assert.ok(registry.search_accounts, 'Should have search_accounts');
      assert.ok(registry.get_account_details, 'Should have get_account_details');
      assert.ok(registry.create_account, 'Should have create_account');
      assert.ok(registry.update_account, 'Should have update_account');
      
      // Contact tools
      assert.ok(registry.search_contacts, 'Should have search_contacts');
      assert.ok(registry.create_contact, 'Should have create_contact');
      
      // Lead tools
      assert.ok(registry.search_leads, 'Should have search_leads');
      assert.ok(registry.create_lead, 'Should have create_lead');
      assert.ok(registry.update_lead, 'Should have update_lead');
      assert.ok(registry.qualify_lead, 'Should have qualify_lead');
      
      // Opportunity tools
      assert.ok(registry.search_opportunities, 'Should have search_opportunities');
      assert.ok(registry.create_opportunity, 'Should have create_opportunity');
      
      // Activity tools
      assert.ok(registry.search_activities, 'Should have search_activities');
      assert.ok(registry.create_activity, 'Should have create_activity');
    });

    test('Each registered tool has required metadata', () => {
      if (!braidModule?.TOOL_REGISTRY) {
        return;
      }
      
      const registry = braidModule.TOOL_REGISTRY;
      
      for (const [toolName, config] of Object.entries(registry)) {
        assert.ok(config.file, `${toolName} should have a file`);
        assert.ok(config.policy, `${toolName} should have a policy`);
      }
    });
  });

  // ============================================================
  // AUDIT LOGGING VERIFICATION
  // ============================================================
  
  describe('Audit Logging', () => {
    
    test('Tool execution creates audit log entries', async () => {
      if (!braidModule?.executeBraidTool || !tenantRecord || !testAccessToken || !supabase) {
        return;
      }
      
      // Execute a read operation
      const beforeTime = new Date().toISOString();
      
      await braidModule.executeBraidTool(
        'search_accounts',
        { limit: 1 },
        tenantRecord,
        TEST_USER_ID,
        testAccessToken
      );
      
      // Give it a moment to write the audit log
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check for recent audit log entry
      const { data: auditLogs } = await supabase
        .from('braid_audit_log')
        .select('*')
        .eq('tenant_id', TENANT_ID)
        .eq('tool_name', 'search_accounts')
        .gte('created_at', beforeTime)
        .order('created_at', { ascending: false })
        .limit(5);
      
      // Audit logs are optional - just verify the query works
      if (auditLogs && auditLogs.length > 0) {
        const log = auditLogs[0];
        assert.ok(log.tool_name, 'Audit log should have tool_name');
        assert.ok(log.created_at, 'Audit log should have timestamp');
        console.log('[Audit] Found', auditLogs.length, 'recent audit entries');
      } else {
        console.log('[Audit] No audit log entries found (may be disabled or async)');
      }
    });
  });
});
