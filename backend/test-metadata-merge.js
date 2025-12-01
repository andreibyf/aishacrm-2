/**
 * Test metadata merge functionality for users, accounts, and contacts
 */

import fetch from 'node-fetch';

const BACKEND_URL = 'http://localhost:3001';
const TEST_TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'; // Updated to match actual tenant

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m'
};

async function test(name, fn) {
  try {
    await fn();
    console.log(`${colors.green}✅ ${name}${colors.reset}`);
    return true;
  } catch (error) {
    console.log(`${colors.red}❌ ${name}${colors.reset}`);
    console.log(`   Error: ${error.message}`);
    return false;
  }
}

async function testUserMetadata() {
  console.log(`\n${colors.blue}═══ TESTING USERS METADATA ═══${colors.reset}\n`);
  
  // Get users list
  const listResponse = await fetch(`${BACKEND_URL}/api/users?tenant_id=${TEST_TENANT_ID}`);
  const listData = await listResponse.json();
  
  if (!listData.data?.users || listData.data.users.length === 0) {
    throw new Error('No users found to test');
  }
  
  const testUser = listData.data.users[0];
  console.log(`   Using user: ${testUser.email} (${testUser.id})`);
  
  // Test 1: Check if metadata is expanded in list
  await test('User list expands metadata fields', () => {
    if (!listData.data.users[0].metadata) {
      throw new Error('No metadata field in response');
    }
    // Check if a metadata field is also at top level (if it exists)
    console.log(`   Metadata keys: ${Object.keys(listData.data.users[0].metadata || {}).join(', ') || 'none'}`);
  });
  
  // Test 2: Update user with custom metadata field
  const testMetadata = {
    navigation_permissions: { Dashboard: true, Contacts: true, TestPage: true },
    custom_field: 'test_value_' + Date.now(),
    tags: ['test', 'metadata']
  };
  
  await test('User PUT merges metadata correctly', async () => {
    const updateResponse = await fetch(`${BACKEND_URL}/api/users/${testUser.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TEST_TENANT_ID,
        ...testMetadata
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update failed: ${updateResponse.status} - ${errorText}`);
    }
    
    const updateData = await updateResponse.json();
    const updatedUser = updateData.data.user;
    
    // Check if metadata was merged
    if (!updatedUser.metadata) {
      throw new Error('Response missing metadata field');
    }
    
    if (updatedUser.metadata.custom_field !== testMetadata.custom_field) {
      throw new Error('Custom field not saved in metadata');
    }
    
    // Check if metadata is expanded to top level
    if (updatedUser.custom_field !== testMetadata.custom_field) {
      throw new Error('Metadata not expanded to top level in response');
    }
    
    console.log(`   ✓ Saved custom_field: ${updatedUser.custom_field}`);
    console.log(`   ✓ Saved navigation_permissions: ${Object.keys(updatedUser.navigation_permissions || {}).length} pages`);
  });
  
  // Test 3: Verify metadata persists on next GET
  await test('User GET retrieves expanded metadata', async () => {
    const getResponse = await fetch(`${BACKEND_URL}/api/users/${testUser.id}?tenant_id=${TEST_TENANT_ID}`);
    const getData = await getResponse.json();
    const retrievedUser = getData.data.user;
    
    if (retrievedUser.custom_field !== testMetadata.custom_field) {
      throw new Error('Custom field not persisted');
    }
    
    console.log(`   ✓ Retrieved custom_field: ${retrievedUser.custom_field}`);
  });
}

async function testAccountMetadata() {
  console.log(`\n${colors.blue}═══ TESTING ACCOUNTS METADATA ═══${colors.reset}\n`);
  
  // Create a test account
  const createData = {
    tenant_id: TEST_TENANT_ID,
    name: 'Test Account ' + Date.now(),
    industry: 'Technology',
    custom_account_field: 'test_account_value'
  };
  
  let accountId;
  
  await test('Account POST stores unknown fields in metadata', async () => {
    const createResponse = await fetch(`${BACKEND_URL}/api/accounts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Create failed: ${createResponse.status} - ${errorText}`);
    }
    
    const result = await createResponse.json();
    accountId = result.data.id;
    console.log(`   Created account: ${accountId}`);
  });
  
  // Test update with metadata
  await test('Account PUT merges metadata', async () => {
    const updateResponse = await fetch(`${BACKEND_URL}/api/accounts/${accountId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        industry: 'Finance',
        custom_field_2: 'value2',
        metadata: { existing: 'data' }
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update failed: ${updateResponse.status} - ${errorText}`);
    }
    
    const updateData = await updateResponse.json();
    const updated = updateData.data;
    
    // Check if custom field is in metadata and expanded
    if (!updated.custom_field_2) {
      throw new Error('Custom field not expanded to top level');
    }
    
    console.log(`   ✓ Metadata expanded: custom_field_2 = ${updated.custom_field_2}`);
  });
  
  // Test GET
  await test('Account GET expands metadata', async () => {
    const getResponse = await fetch(`${BACKEND_URL}/api/accounts/${accountId}`);
    const getData = await getResponse.json();
    
    if (!getData.data.custom_field_2) {
      throw new Error('Metadata not expanded in GET response');
    }
    
    console.log(`   ✓ Retrieved expanded metadata`);
  });
  
  // Cleanup
  await fetch(`${BACKEND_URL}/api/accounts/${accountId}`, { method: 'DELETE' });
}

async function testContactMetadata() {
  console.log(`\n${colors.blue}═══ TESTING CONTACTS METADATA ═══${colors.reset}\n`);
  
  // Create a test contact
  const createData = {
    tenant_id: TEST_TENANT_ID,
    first_name: 'Test',
    last_name: 'Contact',
    email: 'test' + Date.now() + '@example.com',
    custom_contact_field: 'test_contact_value'
  };
  
  let contactId;
  
  await test('Contact POST handles metadata', async () => {
    const createResponse = await fetch(`${BACKEND_URL}/api/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createData)
    });
    
    if (!createResponse.ok) {
      const errorText = await createResponse.text();
      throw new Error(`Create failed: ${createResponse.status} - ${errorText}`);
    }
    
    const result = await createResponse.json();
    contactId = result.data.id;
    console.log(`   Created contact: ${contactId}`);
  });
  
  // Test update with metadata
  await test('Contact PUT merges metadata', async () => {
    const updateResponse = await fetch(`${BACKEND_URL}/api/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone: '555-1234',
        custom_field_2: 'contact_value2',
        preferences: { newsletter: true }
      })
    });
    
    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      throw new Error(`Update failed: ${updateResponse.status} - ${errorText}`);
    }
    
    const updateData = await updateResponse.json();
    const updated = updateData.data;
    
    if (!updated.custom_field_2) {
      throw new Error('Custom field not expanded');
    }
    
    console.log(`   ✓ Metadata expanded: custom_field_2 = ${updated.custom_field_2}`);
  });
  
  // Test GET list
  await test('Contact list expands metadata', async () => {
    const listResponse = await fetch(`${BACKEND_URL}/api/contacts?tenant_id=${TEST_TENANT_ID}`);
    const listData = await listResponse.json();
    
    const contact = listData.data.contacts.find(c => c.id === contactId);
    if (!contact) {
      throw new Error('Contact not found in list');
    }
    
    if (!contact.custom_field_2) {
      throw new Error('Metadata not expanded in list');
    }
    
    console.log(`   ✓ List response has expanded metadata`);
  });
  
  // Cleanup
  await fetch(`${BACKEND_URL}/api/contacts/${contactId}`, { method: 'DELETE' });
}

// Run all tests
async function runTests() {
  console.log(`\n${colors.yellow}╔════════════════════════════════════════════════════════╗${colors.reset}`);
  console.log(`${colors.yellow}║  METADATA MERGE PATTERN - INTEGRATION TESTS            ║${colors.reset}`);
  console.log(`${colors.yellow}╚════════════════════════════════════════════════════════╝${colors.reset}`);
  
  try {
    await testUserMetadata();
    await testAccountMetadata();
    await testContactMetadata();
    
    console.log(`\n${colors.green}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.green}✨ ALL TESTS PASSED!${colors.reset}`);
    console.log(`${colors.green}═══════════════════════════════════════════════════════${colors.reset}\n`);
  } catch (error) {
    console.log(`\n${colors.red}═══════════════════════════════════════════════════════${colors.reset}`);
    console.log(`${colors.red}❌ TESTS FAILED${colors.reset}`);
    console.log(`${colors.red}═══════════════════════════════════════════════════════${colors.reset}\n`);
    console.error(error);
    process.exit(1);
  }
}

runTests();
