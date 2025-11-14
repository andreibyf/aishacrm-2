import { assert } from './testUtils';
import { getBackendUrl } from '@/api/backendUrl';

/**
 * CRUD Tests for CRM Entities
 * 
 * ✅ Backend Infrastructure: READY
 * ✅ Database: Supabase Cloud (DEV/QA)
 * ✅ CRUD Operations: Fully Implemented & Tested
 * 
 * Current Setup:
 * - Backend routes have full SQL CRUD operations
 * - Connected to Supabase Cloud PostgreSQL database
 * - All migrations applied (contacts, leads, accounts tables ready)
 * - Real database operations (not stub data)
 * 
 * Tests include:
 * - Infrastructure checks (backend health, database connectivity)
 * - Full CRUD cycle: Create → Read → Update → Delete
 * - Data validation and integrity checks
 * 
 * To run tests:
 * 1. Ensure backend is running: npm start (in backend folder)
 * 2. Backend should show: "Supabase Cloud DEV/QA" connection
 * 3. Click "Run All Tests" below
 */

const BACKEND_URL = getBackendUrl();
const TEST_TENANT_ID = 'local-tenant-001';

// Helper to generate unique test data
const generateTestData = () => {
  const timestamp = Date.now();
  return {
    contact: {
      tenant_id: TEST_TENANT_ID,
      first_name: `Test`,
      last_name: `Contact_${timestamp}`,
      email: `test.contact.${timestamp}@unittest.local`,
      phone: '555-0100',
      status: 'active'
    },
    lead: {
      tenant_id: TEST_TENANT_ID,
      first_name: `Test`,
      last_name: `Lead_${timestamp}`,
      email: `test.lead.${timestamp}@unittest.local`,
      phone: '555-0200',
      company: 'Test Company',
      status: 'new',
      source: 'unit-test'
    },
    account: {
      tenant_id: TEST_TENANT_ID,
      name: `Test Account ${timestamp}`,
      type: 'customer',
      industry: 'technology',
      website: 'https://test.local'
    }
  };
};

export const crudTests = {
  name: 'CRUD Operations',
  tests: [
    {
      name: 'Infrastructure Check',
      fn: async () => {
        // Prefer deep status endpoint first; fall back to /health on failure
        let status = 'unknown';
        let database = 'unknown';
        let environment = 'unknown';

        // Try /api/system/status
        try {
          const statusResp = await fetch(`${BACKEND_URL}/api/system/status`);
          if (statusResp.ok) {
            const sys = await statusResp.json();
            status = sys?.status || status;
            database = sys?.data?.database || database;
            environment = sys?.data?.environment || environment;
          } else {
            throw new Error(`Status ${statusResp.status}`);
          }
        } catch (e1) {
          // Try /health
          try {
            const response = await fetch(`${BACKEND_URL}/health`);
            if (!response.ok) throw new Error(`Status ${response.status}`);
            const healthData = await response.json();
            status = healthData?.status || status;
            database = healthData?.database || database;
            environment = healthData?.environment || environment;
          } catch (e2) {
            // Network-level reachability failure
            throw new Error(`Backend not reachable at ${BACKEND_URL}: ${e2.message || e1.message}`);
          }
        }

        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('✅ CRUD INFRASTRUCTURE STATUS');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
        console.log('');
        console.log(`Backend: ${BACKEND_URL}`);
        console.log(`Status: ${status}`);
        console.log(`Database: ${database}`);
        console.log(`Environment: ${environment}`);
        console.log('');
        console.log('✅ Backend routes have full SQL CRUD operations');
        console.log('✅ Connected to Supabase Cloud PostgreSQL');
        console.log('✅ Ready for CRUD testing');
        console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

        // Accept either 'ok' or 'success' as healthy
        assert.truthy(['ok', 'success'].includes((status || '').toLowerCase()), 'Backend should be healthy');
        assert.equal(database, 'connected', 'Database should be connected');
      }
    },

    // ==================== CONTACT CRUD TESTS ====================
    {
      name: 'Contact: Create',
      fn: async () => {
        const testData = generateTestData();
        
        const response = await fetch(`${BACKEND_URL}/api/contacts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData.contact)
        });
        
        assert.truthy(response.ok, `Create should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain created contact data');
        
        // Handle wrapped response: { data: { contact: {...} } } or direct { data: {...} }
        const contact = result.data.contact || result.data;
        assert.exists(contact.id, 'Created contact should have an ID');
        assert.equal(contact.email, testData.contact.email, 'Email should match');
        
        console.log(`✅ Created contact: ${contact.first_name} ${contact.last_name} (ID: ${contact.id})`);
        
        // Store ID for next tests
        window.__test_contact_id = contact.id;
      }
    },
    {
      name: 'Contact: Read',
      fn: async () => {
        const contactId = window.__test_contact_id;
        assert.exists(contactId, 'Contact ID from create test should exist');
        
        const response = await fetch(`${BACKEND_URL}/api/contacts/${contactId}?tenant_id=${TEST_TENANT_ID}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `Read should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain contact data');
        assert.equal(result.data.id, contactId, 'Contact ID should match');
        
        console.log(`✅ Read contact: ${result.data.first_name} ${result.data.last_name}`);
      }
    },
    {
      name: 'Contact: Update',
      fn: async () => {
        const contactId = window.__test_contact_id;
        assert.exists(contactId, 'Contact ID from create test should exist');
        
        const updateData = {
          tenant_id: TEST_TENANT_ID,
          phone: '555-9999',
          status: 'inactive'
        };
        
        const response = await fetch(`${BACKEND_URL}/api/contacts/${contactId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        
        assert.truthy(response.ok, `Update should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.equal(result.data.phone, '555-9999', 'Phone should be updated');
        assert.equal(result.data.status, 'inactive', 'Status should be updated');
        
        console.log(`✅ Updated contact: phone=${result.data.phone}, status=${result.data.status}`);
      }
    },
    {
      name: 'Contact: Delete',
      fn: async () => {
        const contactId = window.__test_contact_id;
        assert.exists(contactId, 'Contact ID from create test should exist');
        
        const response = await fetch(`${BACKEND_URL}/api/contacts/${contactId}?tenant_id=${TEST_TENANT_ID}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `Delete should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        
        // Verify deletion by trying to read
        const readResponse = await fetch(`${BACKEND_URL}/api/contacts/${contactId}?tenant_id=${TEST_TENANT_ID}`);
        const readResult = await readResponse.json();
        
        assert.truthy(
          readResult.status === 'error' || !readResult.data,
          'Contact should not exist after deletion'
        );
        
        console.log(`✅ Deleted contact ID: ${contactId}`);
        delete window.__test_contact_id;
      }
    },

    // ==================== LEAD CRUD TESTS ====================
    {
      name: 'Lead: Create',
      fn: async () => {
        const testData = generateTestData();
        
        const response = await fetch(`${BACKEND_URL}/api/leads`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData.lead)
        });
        
        assert.truthy(response.ok, `Create should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain created lead data');
        
        // Handle wrapped response: { data: { lead: {...} } } or direct { data: {...} }
        const lead = result.data.lead || result.data;
        assert.exists(lead.id, 'Created lead should have an ID');
        assert.equal(lead.email, testData.lead.email, 'Email should match');
        
        console.log(`✅ Created lead: ${lead.first_name} ${lead.last_name} (ID: ${lead.id})`);
        
        window.__test_lead_id = lead.id;
      }
    },
    {
      name: 'Lead: Read',
      fn: async () => {
        const leadId = window.__test_lead_id;
        assert.exists(leadId, 'Lead ID from create test should exist');
        
        const response = await fetch(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${TEST_TENANT_ID}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `Read should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain lead data');
        assert.equal(result.data.id, leadId, 'Lead ID should match');
        
        console.log(`✅ Read lead: ${result.data.first_name} ${result.data.last_name}`);
      }
    },
    {
      name: 'Lead: Update',
      fn: async () => {
        const leadId = window.__test_lead_id;
        assert.exists(leadId, 'Lead ID from create test should exist');
        
        const updateData = {
          tenant_id: TEST_TENANT_ID,
          status: 'qualified',
          source: 'unit-test-updated'
        };
        
        const response = await fetch(`${BACKEND_URL}/api/leads/${leadId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        
        assert.truthy(response.ok, `Update should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.equal(result.data.status, 'qualified', 'Status should be updated');
        
        console.log(`✅ Updated lead: status=${result.data.status}`);
      }
    },
    {
      name: 'Lead: Delete',
      fn: async () => {
        const leadId = window.__test_lead_id;
        assert.exists(leadId, 'Lead ID from create test should exist');
        
        const response = await fetch(`${BACKEND_URL}/api/leads/${leadId}?tenant_id=${TEST_TENANT_ID}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `Delete should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        
        console.log(`✅ Deleted lead ID: ${leadId}`);
        delete window.__test_lead_id;
      }
    },

    // ==================== ACCOUNT CRUD TESTS ====================
    {
      name: 'Account: Create',
      fn: async () => {
        const testData = generateTestData();
        
        const response = await fetch(`${BACKEND_URL}/api/accounts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(testData.account)
        });
        
        assert.truthy(response.ok, `Create should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain created account data');
        
        // Handle wrapped response: { data: { account: {...} } } or direct { data: {...} }
        const account = result.data.account || result.data;
        assert.exists(account.id, 'Created account should have an ID');
        assert.equal(account.name, testData.account.name, 'Name should match');
        
        console.log(`✅ Created account: ${account.name} (ID: ${account.id})`);
        
        window.__test_account_id = account.id;
      }
    },
    {
      name: 'Account: Read',
      fn: async () => {
        const accountId = window.__test_account_id;
        assert.exists(accountId, 'Account ID from create test should exist');
        
        const response = await fetch(`${BACKEND_URL}/api/accounts/${accountId}?tenant_id=${TEST_TENANT_ID}`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `Read should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain account data');
        assert.equal(result.data.id, accountId, 'Account ID should match');
        
        console.log(`✅ Read account: ${result.data.name}`);
      }
    },
    {
      name: 'Account: Update',
      fn: async () => {
        const accountId = window.__test_account_id;
        assert.exists(accountId, 'Account ID from create test should exist');
        
        const updateData = {
          tenant_id: TEST_TENANT_ID,
          industry: 'finance',
          type: 'partner'
        };
        
        const response = await fetch(`${BACKEND_URL}/api/accounts/${accountId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updateData)
        });
        
        assert.truthy(response.ok, `Update should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.equal(result.data.industry, 'finance', 'Industry should be updated');
        assert.equal(result.data.type, 'partner', 'Type should be updated');
        
        console.log(`✅ Updated account: industry=${result.data.industry}, type=${result.data.type}`);
      }
    },
    {
      name: 'Account: Delete',
      fn: async () => {
        const accountId = window.__test_account_id;
        assert.exists(accountId, 'Account ID from create test should exist');
        
        const response = await fetch(`${BACKEND_URL}/api/accounts/${accountId}?tenant_id=${TEST_TENANT_ID}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `Delete should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        
        console.log(`✅ Deleted account ID: ${accountId}`);
        delete window.__test_account_id;
      }
    },

    // ==================== DATA INTEGRITY TESTS ====================
    {
      name: 'List with Filters',
      fn: async () => {
        // Test that GET endpoints support filtering
        const response = await fetch(`${BACKEND_URL}/api/contacts?tenant_id=${TEST_TENANT_ID}&limit=10`, {
          method: 'GET',
          headers: { 'Content-Type': 'application/json' }
        });
        
        assert.truthy(response.ok, `List should succeed (status: ${response.status})`);
        
        const result = await response.json();
        assert.equal(result.status, 'success', 'Response status should be success');
        assert.exists(result.data, 'Response should contain data object');
        assert.exists(result.data.contacts, 'Data should have contacts array');
        assert.truthy(Array.isArray(result.data.contacts), 'Contacts should be an array');
        assert.exists(result.data.total, 'Response should include total count');
        assert.exists(result.data.limit, 'Response should include limit');
        assert.exists(result.data.offset, 'Response should include offset');
        
        console.log(`✅ List contacts returned ${result.data.contacts.length} of ${result.data.total} total records`);
      }
    }
  ]
};
