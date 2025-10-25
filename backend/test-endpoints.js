/**
 * Backend Endpoint Testing Script
 * Tests all critical CRUD operations
 */

const BASE_URL = 'http://localhost:3001';
const TEST_TENANT_ID = 'test-tenant-' + Date.now();

// Color output helpers
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

function log(color, ...args) {
  console.log(color, ...args, colors.reset);
}

async function testEndpoint(name, method, path, body = null, expectedStatus = 200) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    
    if (body) {
      options.body = JSON.stringify(body);
    }
    
    const response = await fetch(`${BASE_URL}${path}`, options);
    const data = await response.json();
    
    const success = response.status === expectedStatus;
    if (success) {
      log(colors.green, `✅ ${name}`);
      return { success: true, data, status: response.status };
    } else {
      log(colors.red, `❌ ${name} - Expected ${expectedStatus}, got ${response.status}`);
      console.log('   Response:', data);
      return { success: false, data, status: response.status };
    }
  } catch (error) {
    log(colors.red, `❌ ${name} - ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function runTests() {
  console.log('\n🧪 Backend Endpoint Testing\n');
  console.log('='.repeat(70));
  
  let testsPassed = 0;
  let testsFailed = 0;
  const createdRecords = {};

  // Health check
  log(colors.blue, '\n📊 System Health');
  const health = await testEndpoint('Health Check', 'GET', '/health');
  if (health.success) testsPassed++; else testsFailed++;

  // Test Accounts
  log(colors.blue, '\n📁 Accounts');
  const account = await testEndpoint(
    'Create Account',
    'POST',
    '/api/accounts',
    { tenant_id: TEST_TENANT_ID, name: 'Test Account', type: 'Customer' }
  );
  if (account.success) {
    testsPassed++;
    createdRecords.account_id = account.data.data?.account?.id;
    
    const listAccounts = await testEndpoint(
      'List Accounts',
      'GET',
      `/api/accounts?tenant_id=${TEST_TENANT_ID}`
    );
    if (listAccounts.success) testsPassed++; else testsFailed++;
    
    if (createdRecords.account_id) {
      const getAccount = await testEndpoint(
        'Get Account',
        'GET',
        `/api/accounts/${createdRecords.account_id}?tenant_id=${TEST_TENANT_ID}`
      );
      if (getAccount.success) testsPassed++; else testsFailed++;
    }
  } else {
    testsFailed++;
  }

  // Test Contacts
  log(colors.blue, '\n👥 Contacts');
  const contact = await testEndpoint(
    'Create Contact',
    'POST',
    '/api/contacts',
    { 
      tenant_id: TEST_TENANT_ID, 
      first_name: 'John', 
      last_name: 'Doe',
      email: 'john.doe@test.com',
      account_id: createdRecords.account_id
    }
  );
  if (contact.success) {
    testsPassed++;
    createdRecords.contact_id = contact.data.data?.contact?.id;
    
    const listContacts = await testEndpoint(
      'List Contacts',
      'GET',
      `/api/contacts?tenant_id=${TEST_TENANT_ID}`
    );
    if (listContacts.success) testsPassed++; else testsFailed++;
  } else {
    testsFailed++;
  }

  // Test Leads
  log(colors.blue, '\n🎯 Leads');
  const lead = await testEndpoint(
    'Create Lead',
    'POST',
    '/api/leads',
    { 
      tenant_id: TEST_TENANT_ID, 
      first_name: 'Jane', 
      last_name: 'Smith',
      email: 'jane.smith@test.com',
      company: 'Test Corp',
      status: 'New'
    }
  );
  if (lead.success) {
    testsPassed++;
    createdRecords.lead_id = lead.data.data?.lead?.id;
    
    const listLeads = await testEndpoint(
      'List Leads',
      'GET',
      `/api/leads?tenant_id=${TEST_TENANT_ID}`
    );
    if (listLeads.success) testsPassed++; else testsFailed++;
  } else {
    testsFailed++;
  }

  // Test Opportunities
  log(colors.blue, '\n💼 Opportunities');
  const opportunity = await testEndpoint(
    'Create Opportunity',
    'POST',
    '/api/opportunities',
    { 
      tenant_id: TEST_TENANT_ID, 
      name: 'Test Deal',
      amount: 10000,
      stage: 'Qualification',
      account_id: createdRecords.account_id
    }
  );
  if (opportunity.success) {
    testsPassed++;
    createdRecords.opportunity_id = opportunity.data.data?.opportunity?.id;
    
    const listOpportunities = await testEndpoint(
      'List Opportunities',
      'GET',
      `/api/opportunities?tenant_id=${TEST_TENANT_ID}`
    );
    if (listOpportunities.success) testsPassed++; else testsFailed++;
  } else {
    testsFailed++;
  }

  // Test Employees
  log(colors.blue, '\n👔 Employees');
  const employee = await testEndpoint(
    'Create Employee',
    'POST',
    '/api/employees',
    { 
      tenant_id: TEST_TENANT_ID, 
      first_name: 'Bob',
      last_name: 'Manager',
      email: 'bob.manager@test.com',
      role: 'Sales Manager'
    }
  );
  if (employee.success) {
    testsPassed++;
    createdRecords.employee_id = employee.data.data?.employee?.id;
    
    const listEmployees = await testEndpoint(
      'List Employees',
      'GET',
      `/api/employees?tenant_id=${TEST_TENANT_ID}`
    );
    if (listEmployees.success) testsPassed++; else testsFailed++;
  } else {
    testsFailed++;
  }

  // Test Users
  log(colors.blue, '\n🔐 Users');
  const user = await testEndpoint(
    'Register User',
    'POST',
    '/api/users/register',
    { 
      tenant_id: TEST_TENANT_ID, 
      email: 'testuser@test.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'admin'
    }
  );
  if (user.success) {
    testsPassed++;
    createdRecords.user_id = user.data.data?.user?.id;
    
    const listUsers = await testEndpoint(
      'List Users',
      'GET',
      `/api/users?tenant_id=${TEST_TENANT_ID}`
    );
    if (listUsers.success) testsPassed++; else testsFailed++;
  } else {
    testsFailed++;
  }

  // Test Notes
  log(colors.blue, '\n📝 Notes');
  const note = await testEndpoint(
    'Create Note',
    'POST',
    '/api/notes',
    { 
      tenant_id: TEST_TENANT_ID, 
      title: 'Test Note',
      content: 'This is a test note',
      related_type: 'Contact',
      related_id: createdRecords.contact_id
    }
  );
  if (note.success) {
    testsPassed++;
    createdRecords.note_id = note.data.data?.note?.id;
  } else {
    testsFailed++;
  }

  // Cleanup - Delete created records
  log(colors.blue, '\n🧹 Cleanup');
  if (createdRecords.note_id) {
    const deleteNote = await testEndpoint(
      'Delete Note',
      'DELETE',
      `/api/notes/${createdRecords.note_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteNote.success) testsPassed++; else testsFailed++;
  }
  
  if (createdRecords.user_id) {
    const deleteUser = await testEndpoint(
      'Delete User',
      'DELETE',
      `/api/users/${createdRecords.user_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteUser.success) testsPassed++; else testsFailed++;
  }
  
  if (createdRecords.employee_id) {
    const deleteEmployee = await testEndpoint(
      'Delete Employee',
      'DELETE',
      `/api/employees/${createdRecords.employee_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteEmployee.success) testsPassed++; else testsFailed++;
  }
  
  if (createdRecords.opportunity_id) {
    const deleteOpportunity = await testEndpoint(
      'Delete Opportunity',
      'DELETE',
      `/api/opportunities/${createdRecords.opportunity_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteOpportunity.success) testsPassed++; else testsFailed++;
  }
  
  if (createdRecords.lead_id) {
    const deleteLead = await testEndpoint(
      'Delete Lead',
      'DELETE',
      `/api/leads/${createdRecords.lead_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteLead.success) testsPassed++; else testsFailed++;
  }
  
  if (createdRecords.contact_id) {
    const deleteContact = await testEndpoint(
      'Delete Contact',
      'DELETE',
      `/api/contacts/${createdRecords.contact_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteContact.success) testsPassed++; else testsFailed++;
  }
  
  if (createdRecords.account_id) {
    const deleteAccount = await testEndpoint(
      'Delete Account',
      'DELETE',
      `/api/accounts/${createdRecords.account_id}?tenant_id=${TEST_TENANT_ID}`
    );
    if (deleteAccount.success) testsPassed++; else testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('\n📊 Test Summary:\n');
  log(colors.green, `✅ Passed: ${testsPassed}`);
  log(colors.red, `❌ Failed: ${testsFailed}`);
  const total = testsPassed + testsFailed;
  const percentage = ((testsPassed / total) * 100).toFixed(1);
  log(colors.blue, `📈 Success Rate: ${percentage}%\n`);
  
  if (testsFailed === 0) {
    log(colors.green, '🎉 All tests passed! Backend is fully operational.\n');
  } else {
    log(colors.yellow, '⚠️  Some tests failed. Review the output above for details.\n');
  }
}

// Run tests
runTests().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
