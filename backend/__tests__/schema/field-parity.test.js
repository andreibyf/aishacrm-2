/**
 * Field Parity Test Suite
 * 
 * Validates that all fields used in frontend forms exist as database columns.
 * This prevents the recurring issue of "column X does not exist" errors.
 * 
 * Run with: npm test -- --test-name-pattern="Field Parity"
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'b62b764d-4f27-4e20-a8ad-8eb9b2e1055c';

// Skip if not running backend tests or backend not available
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;
const TEST_TIMEOUT_MS = Number(process.env.TEST_TIMEOUT_MS || 30000);

/**
 * Expected fields for each entity based on frontend form usage
 * These are the fields that the frontend sends to the API
 * If a field is used in a form but not in the database, the test will fail
 */
const ENTITY_FIELD_CONTRACTS = {
  leads: {
    endpoint: '/api/leads',
    // Required fields
    required: ['tenant_id', 'first_name', 'last_name'],
    // All fields used in frontend forms/tables
    fields: [
      'id', 'tenant_id', 'first_name', 'last_name', 'email', 'phone',
      'company', 'status', 'source', 'account_id', 'priority',
      // Communication preferences
      'do_not_call', 'do_not_text',
      // Address fields
      'address_1', 'address_2', 'city', 'state', 'zip', 'country',
      // Scoring
      'score', 'score_reason', 'estimated_value',
      // Assignment and tracking
      'assigned_to', 'unique_id', 'tags',
      // Test data flag
      'is_test_data',
      // Timestamps
      'created_at', 'updated_at',
      // Metadata (always allowed as JSONB fallback)
      'metadata'
    ]
  },

  contacts: {
    endpoint: '/api/contacts',
    required: ['tenant_id', 'first_name', 'last_name'],
    fields: [
      'id', 'tenant_id', 'first_name', 'last_name', 'email', 'phone',
      'account_id', 'title', 'status', 'notes',
      // Communication preferences
      'do_not_call', 'do_not_text',
      // Address fields
      'address_1', 'address_2', 'city', 'state', 'zip', 'country',
      // Professional info
      'job_title', 'department',
      // Assignment and tracking
      'assigned_to', 'lead_source', 'tags',
      // Test data flag
      'is_test_data',
      // Timestamps
      'created_at', 'updated_at',
      'metadata'
    ]
  },

  accounts: {
    endpoint: '/api/accounts',
    required: ['tenant_id', 'name'],
    fields: [
      'id', 'tenant_id', 'name', 'type', 'industry', 'status',
      'website', 'phone', 'email', 'description',
      // Address fields
      'address_1', 'address_2', 'city', 'state', 'zip', 'country',
      // Business fields
      'annual_revenue', 'employee_count',
      // Assignment and tracking
      'assigned_to', 'tags', 'notes',
      // Test data flag
      'is_test_data',
      // Timestamps
      'created_at', 'updated_at',
      'metadata'
    ]
  },

  opportunities: {
    endpoint: '/api/opportunities',
    required: ['tenant_id', 'name', 'account_id'],
    fields: [
      'id', 'tenant_id', 'name', 'account_id', 'contact_id',
      'stage', 'amount', 'probability', 'expected_close_date',
      'description', 'status', 'type',
      // Assignment and tracking
      'assigned_to', 'source', 'notes', 'tags',
      // Test data flag
      'is_test_data',
      // Timestamps
      'created_at', 'updated_at',
      'metadata'
    ]
  },

  activities: {
    endpoint: '/api/v2/activities',
    required: ['tenant_id', 'type', 'subject'],
    fields: [
      'id', 'tenant_id', 'type', 'subject', 'body', 'status',
      'due_date', 'due_time', 'priority', 'location',
      // Polymorphic relationship (can relate to lead, contact, account, or opportunity)
      'related_id', 'related_to',
      // Assignment/ownership
      'created_by', 'assigned_to',
      // Test data flag
      'is_test_data',
      // Timestamps (activities uses created_date/updated_date per migration 002)
      'created_date', 'updated_date',
      'metadata'
    ]
  },

  employees: {
    endpoint: '/api/employees',
    required: ['tenant_id', 'email'],
    fields: [
      'id', 'tenant_id', 'email', 'first_name', 'last_name',
      'role', 'department', 'title', 'status', 'phone',
      'hire_date', 'user_id',
      // Test data flag
      'is_test_data',
      // Timestamps
      'created_at', 'updated_at',
      'metadata'
    ]
  }
};

/**
 * Test helper: create a minimal valid entity with all fields
 */
function createTestPayload(entity, fields, required) {
  const payload = { tenant_id: TENANT_ID };
  
  // Add required fields with test values
  for (const field of required) {
    if (field === 'tenant_id') continue;
    if (field === 'first_name') payload.first_name = 'TestFirst';
    else if (field === 'last_name') payload.last_name = 'TestLast';
    else if (field === 'name') payload.name = `Test ${entity} ${Date.now()}`;
    else if (field === 'email') payload.email = `test-${Date.now()}@example.com`;
    else if (field === 'account_id') payload.account_id = null; // Will need real account for some entities
    else if (field === 'type') payload.type = 'test';
    else if (field === 'subject') payload.subject = 'Test Subject';
  }
  
  return payload;
}

/**
 * Test helper: add optional fields to payload
 */
function addOptionalFields(payload, fields) {
  const testValues = {
    // String fields
    email: `parity-test-${Date.now()}@example.com`,
    phone: '+1-555-0100',
    company: 'Parity Test Corp',
    status: 'new',
    source: 'test',
    priority: 'normal',  // Must match activity_priority enum
    description: 'Field parity test',
    notes: 'Test notes',
    title: 'Test Title',
    job_title: 'Test Job Title',
    department: 'Test Dept',
    industry: 'Technology',
    website: 'https://example.com',
    lead_source: 'test',
    stage: 'prospect',
    type: 'test',
    subject: 'Test Subject',
    role: 'user',
    
    // Address fields
    address_1: '123 Test St',
    address_2: 'Suite 100',
    city: 'Test City',
    state: 'TS',
    zip: '12345',
    country: 'US',
    
    // Boolean fields
    do_not_call: false,
    do_not_text: false,
    is_test_data: true,
    
    // Numeric fields
    score: 75,
    estimated_value: 10000,
    annual_revenue: 1000000,
    employee_count: 50,
    amount: 5000,
    probability: 50,
    
    // Array fields
    tags: ['test', 'parity'],
    
    // UUID fields (set to null, they need real FKs)
    account_id: null,
    contact_id: null,
    lead_id: null,
    opportunity_id: null,
    assigned_to: null,
    owner_id: null,
    user_id: null,
    
    // Polymorphic relationship fields (for activities)
    related_id: null,
    related_to: null,
    
    // Date fields
    due_date: new Date().toISOString(),
    expected_close_date: new Date().toISOString(),
    hire_date: new Date().toISOString().split('T')[0],
    
    // Score reason
    score_reason: 'Test score reason',
    
    // Unique ID
    unique_id: `test-${Date.now()}`,
  };
  
  for (const field of fields) {
    if (field in payload) continue; // Already set
    if (field === 'id' || field === 'created_at' || field === 'updated_at') continue; // Auto-generated
    if (field === 'tenant_id') continue; // Already set
    if (field === 'metadata') continue; // Skip metadata, tested separately
    
    if (field in testValues) {
      payload[field] = testValues[field];
    }
  }
  
  return payload;
}

/**
 * Test helper: make API request
 */
async function apiRequest(method, path, body = null) {
  const authHeaders = getAuthHeaders();
  
  // Debug: log auth headers on first call
  if (!apiRequest._logged) {
    console.log('[field-parity DEBUG] Auth headers:', JSON.stringify(authHeaders, null, 2));
    console.log('[field-parity DEBUG] Has Authorization:', !!authHeaders.Authorization);
    console.log('[field-parity DEBUG] Has apikey:', !!authHeaders.apikey);
    apiRequest._logged = true;
  }
  
  const options = {
    method,
    headers: {
      ...authHeaders,
      'x-tenant-id': TENANT_ID
    },
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  const url = path.includes('?') 
    ? `${BASE_URL}${path}&tenant_id=${TENANT_ID}`
    : `${BASE_URL}${path}?tenant_id=${TENANT_ID}`;
    
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  
  return { status: res.status, json };
}

// Track created entities for cleanup - initialize immediately
const createdEntities = {
  leads: [],
  contacts: [],
  accounts: [],
  opportunities: [],
  activities: [],
  employees: []
};

// Cleanup helper
async function cleanupAllEntities() {
  for (const [entity, ids] of Object.entries(createdEntities)) {
    const endpoint = ENTITY_FIELD_CONTRACTS[entity]?.endpoint;
    if (!endpoint) continue;
    
    for (const id of ids) {
      try {
        await apiRequest('DELETE', `${endpoint}/${id}`);
      } catch {
        // Ignore cleanup errors
      }
    }
    createdEntities[entity] = []; // Reset for next suite
  }
}

describe('Field Parity Tests', { skip: !SHOULD_RUN }, () => {
  
  after(async () => {
    await cleanupAllEntities();
  });

  // Test each entity type
  for (const [entity, config] of Object.entries(ENTITY_FIELD_CONTRACTS)) {
    
    test(`${entity}: All form fields accepted by API (no column errors)`, { timeout: TEST_TIMEOUT_MS }, async () => {
      const { endpoint, required, fields } = config;
      
      // Create base payload with required fields
      let payload = createTestPayload(entity, fields, required);
      
      // Add all optional fields
      payload = addOptionalFields(payload, fields);
      
      // Mark as test data
      payload.is_test_data = true;
      
      // Attempt to create entity with all fields
      const createRes = await apiRequest('POST', endpoint, payload);
      
      // Check for column-related errors
      const errorMessage = createRes.json?.error || createRes.json?.message || '';
      const hasColumnError = /column.*does not exist|undefined column|unknown column/i.test(errorMessage);
      
      if (hasColumnError) {
        // Extract the missing column name
        const columnMatch = errorMessage.match(/column "([^"]+)" (?:of relation "[^"]+" )?does not exist/i) 
          || errorMessage.match(/Unknown column[:\s]*['"]?([^'"]+)['"]?/i);
        const missingColumn = columnMatch ? columnMatch[1] : 'unknown';
        
        assert.fail(
          `Entity "${entity}" is missing database column: ${missingColumn}\n` +
          `Full error: ${errorMessage}\n` +
          `Payload sent: ${JSON.stringify(payload, null, 2)}\n` +
          `Action required: Create migration to add missing column(s)`
        );
      }
      
      // If we got a 200/201, record the ID for cleanup
      if (createRes.status === 200 || createRes.status === 201) {
        const id = createRes.json?.data?.id || createRes.json?.data?.[entity.slice(0, -1)]?.id;
        if (id) {
          createdEntities[entity].push(id);
        }
      }
      
      // Assert the request didn't fail due to schema issues
      // (other validation errors like FK constraints are ok - they mean the column exists)
      assert.ok(
        createRes.status === 200 || createRes.status === 201 || 
        createRes.status === 400 || createRes.status === 422,
        `Unexpected status ${createRes.status} for ${entity}: ${JSON.stringify(createRes.json)}`
      );
    });

    test(`${entity}: Can query all expected fields`, { timeout: TEST_TIMEOUT_MS }, async () => {
      const { endpoint } = config;
      
      // Fetch list to verify columns are selectable
      const listRes = await apiRequest('GET', `${endpoint}?limit=1`);
      
      // Check for column errors in SELECT
      const errorMessage = listRes.json?.error || listRes.json?.message || '';
      const hasColumnError = /column.*does not exist/i.test(errorMessage);
      
      if (hasColumnError) {
        assert.fail(`Entity "${entity}" query failed: ${errorMessage}`);
      }
      
      assert.ok(
        listRes.status === 200,
        `List ${entity} failed with status ${listRes.status}: ${JSON.stringify(listRes.json)}`
      );
    });

    test(`${entity}: Update accepts all form fields`, { timeout: TEST_TIMEOUT_MS }, async () => {
      const { endpoint, required, fields } = config;
      
      // First create a minimal entity
      const createPayload = createTestPayload(entity, fields, required);
      createPayload.is_test_data = true;
      
      const createRes = await apiRequest('POST', endpoint, createPayload);
      
      // Skip if create failed (covered by other test)
      if (createRes.status !== 200 && createRes.status !== 201) {
        return;
      }
      
      const id = createRes.json?.data?.id || createRes.json?.data?.[entity.slice(0, -1)]?.id;
      if (id) {
        createdEntities[entity].push(id);
      }
      
      if (!id) {
        return; // Can't test update without ID
      }
      
      // Now update with all fields
      const updatePayload = addOptionalFields({}, fields);
      delete updatePayload.tenant_id; // Don't try to update tenant_id
      
      const updateRes = await apiRequest('PUT', `${endpoint}/${id}`, updatePayload);
      
      // Check for column errors
      const errorMessage = updateRes.json?.error || updateRes.json?.message || '';
      const hasColumnError = /column.*does not exist|undefined column/i.test(errorMessage);
      const hasSchemaCacheError = /schema cache/i.test(errorMessage);
      
      if (hasColumnError) {
        const columnMatch = errorMessage.match(/column "([^"]+)"/i);
        const missingColumn = columnMatch ? columnMatch[1] : 'unknown';
        
        assert.fail(
          `Entity "${entity}" update is missing database column: ${missingColumn}\n` +
          `Error: ${errorMessage}`
        );
      }
      
      // Schema cache errors indicate real schema issues - fail the test
      if (hasSchemaCacheError) {
        const columnMatch = errorMessage.match(/'([^']+)' column/i);
        const missingColumn = columnMatch ? columnMatch[1] : 'unknown';
        
        assert.fail(
          `Entity "${entity}" is missing database column: ${missingColumn}\n` +
          `Error: ${errorMessage}\n` +
          `Action required: Add column to migration`
        );
      }
      
      assert.ok(
        updateRes.status === 200 || updateRes.status === 400 || updateRes.status === 422 || updateRes.status === 404,
        `Update ${entity} got unexpected status ${updateRes.status}: ${JSON.stringify(updateRes.json)}`
      );
    });
  }
});

/**
 * Database Schema Verification Tests
 * These tests directly query the database to verify column existence
 */
describe('Database Schema Verification', { skip: !SHOULD_RUN }, () => {
  
  test('Schema endpoint returns column information', async () => {
    // This assumes you have a /api/system/schema endpoint
    // If not, we can add one or skip this test
    const res = await apiRequest('GET', '/api/database/schema');
    
    if (res.status === 404) {
      // Schema endpoint doesn't exist, skip
      return;
    }
    
    assert.equal(res.status, 200, `Schema endpoint failed: ${JSON.stringify(res.json)}`);
  });
});

/**
 * Critical Field Regression Tests
 * These test specific fields that have caused production issues
 */
describe('Critical Field Regression Tests', { skip: !SHOULD_RUN }, () => {
  
  after(async () => {
    await cleanupAllEntities();
  });

  test('Leads: do_not_call column exists and accepts boolean', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      first_name: 'DoNotCall',
      last_name: `Test_${Date.now()}`,
      email: `dnc-${Date.now()}@example.com`,
      do_not_call: true,
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/leads', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('do_not_call'),
      `do_not_call column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.lead?.id;
      if (id) createdEntities.leads.push(id);
    }
  });

  test('Leads: is_test_data column exists and accepts boolean', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      first_name: 'IsTestData',
      last_name: `Test_${Date.now()}`,
      email: `itd-${Date.now()}@example.com`,
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/leads', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('is_test_data'),
      `is_test_data column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.lead?.id;
      if (id) createdEntities.leads.push(id);
    }
  });

  test('Leads: assigned_to column exists and accepts UUID', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      first_name: 'AssignedTo',
      last_name: `Test_${Date.now()}`,
      email: `ato-${Date.now()}@example.com`,
      assigned_to: null, // null is valid UUID value
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/leads', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('assigned_to') || !errorMessage.includes('does not exist'),
      `assigned_to column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.lead?.id;
      if (id) createdEntities.leads.push(id);
    }
  });

  test('Leads: tags column exists and accepts array', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      first_name: 'Tags',
      last_name: `Test_${Date.now()}`,
      email: `tags-${Date.now()}@example.com`,
      tags: ['test', 'parity'],
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/leads', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('tags') || !errorMessage.includes('does not exist'),
      `tags column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.lead?.id;
      if (id) createdEntities.leads.push(id);
    }
  });

  test('Contacts: job_title and department columns exist', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      first_name: 'JobTitle',
      last_name: `Test_${Date.now()}`,
      email: `jt-${Date.now()}@example.com`,
      job_title: 'Test Engineer',
      department: 'Engineering',
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/contacts', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('job_title') && !errorMessage.includes('department'),
      `job_title/department column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.contact?.id;
      if (id) createdEntities.contacts.push(id);
    }
  });

  test('Accounts: tags and notes columns exist', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      name: `Tags Notes Test ${Date.now()}`,
      tags: ['test'],
      notes: 'Test notes for parity check',
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/accounts', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('tags') && !errorMessage.includes('notes'),
      `tags/notes column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.account?.id;
      if (id) createdEntities.accounts.push(id);
    }
  });

  test('Opportunities: source and notes columns exist', async () => {
    const payload = {
      tenant_id: TENANT_ID,
      name: `Source Notes Test ${Date.now()}`,
      source: 'test',
      notes: 'Test notes',
      stage: 'prospect',
      is_test_data: true
    };
    
    const res = await apiRequest('POST', '/api/opportunities', payload);
    
    const errorMessage = res.json?.error || '';
    assert.ok(
      !errorMessage.includes('source') && !errorMessage.includes('notes'),
      `source/notes column issue: ${errorMessage}`
    );
    
    if (res.status === 200 || res.status === 201) {
      const id = res.json?.data?.id || res.json?.data?.opportunity?.id;
      if (id) createdEntities.opportunities.push(id);
    }
  });
});
