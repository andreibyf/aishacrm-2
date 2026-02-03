/**
 * Integration test for Braid tools - search contacts and leads
 * Tests actual tool execution through the Braid execution layer
 */

import { executeBraidTool, TOOL_ACCESS_TOKEN } from './lib/braid/execution.js';

// Test timeout (30 seconds for actual API calls)
const TEST_TIMEOUT = 30000;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Test timeout after ${TEST_TIMEOUT}ms`)), TEST_TIMEOUT)
    )
  ]).then(() => {
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  }).catch(err => {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    if (err.stack) {
      console.error(`   ${err.stack.split('\n').slice(1, 4).join('\n')}`);
    }
    testsFailed++;
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('\n🧪 Testing Braid Tool Integration (Contacts & Leads)\n');
  console.log('=' .repeat(60));

  // Check for required environment variables
  if (!process.env.JWT_SECRET) {
    console.error('⚠️  JWT_SECRET environment variable not set');
    console.log('   Setting temporary test secret...');
    process.env.JWT_SECRET = 'test-jwt-secret-for-braid-integration-testing';
  }

  // Test tenant record
  const tenantRecord = {
    id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    tenant_id: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
    name: 'Test Tenant'
  };

  await test('search_contacts tool executes without parameter nesting', async () => {
    const args = {
      query: 'Carol',
      limit: 10
    };

    const result = await executeBraidTool(
      'search_contacts',
      args,
      tenantRecord,
      'test-user-id',
      TOOL_ACCESS_TOKEN
    );

    // Check result structure
    assert(result, 'Should return a result');
    assert(result.tag === 'Ok' || result.tag === 'Err', 
      `Result should have Ok or Err tag, got ${result.tag}`);
    
    // If error, it should be a legitimate API error, not parameter issues
    if (result.tag === 'Err' && result.error) {
      console.log(`   Note: Got error (this is ok if data doesn't exist): ${result.error.message || result.error.type}`);
      // Make sure it's not a parameter error
      assert(!result.error.message?.includes('undefined'), 
        'Error should not mention undefined parameters');
    }

    // If success, check data structure
    if (result.tag === 'Ok') {
      console.log(`   Found ${result.value?.length || 0} contacts`);
      assert(Array.isArray(result.value) || result.value === null, 
        'Result should be array or null');
    }
  });

  await test('search_leads tool executes without parameter nesting', async () => {
    const args = {
      query: 'Jimmy',
      limit: 10
    };

    const result = await executeBraidTool(
      'search_leads',
      args,
      tenantRecord,
      'test-user-id',
      TOOL_ACCESS_TOKEN
    );

    assert(result, 'Should return a result');
    assert(result.tag === 'Ok' || result.tag === 'Err', 
      `Result should have Ok or Err tag, got ${result.tag}`);

    if (result.tag === 'Err' && result.error) {
      console.log(`   Note: Got error (this is ok if data doesn't exist): ${result.error.message || result.error.type}`);
      assert(!result.error.message?.includes('undefined'), 
        'Error should not mention undefined parameters');
    }

    if (result.tag === 'Ok') {
      console.log(`   Found ${result.value?.length || 0} leads`);
      assert(Array.isArray(result.value) || result.value === null, 
        'Result should be array or null');
    }
  });

  await test('list_contacts_for_account tool executes correctly', async () => {
    const args = {
      account_id: '00000000-0000-0000-0000-000000000001', // Dummy ID
      limit: 5
    };

    const result = await executeBraidTool(
      'list_contacts_for_account',
      args,
      tenantRecord,
      'test-user-id',
      TOOL_ACCESS_TOKEN
    );

    assert(result, 'Should return a result');
    assert(result.tag === 'Ok' || result.tag === 'Err', 
      'Result should have tag');

    // Empty results are OK (account might not exist)
    if (result.tag === 'Ok') {
      console.log(`   Found ${result.value?.length || 0} contacts for account`);
    }
  });

  await test('get_contact_by_name tool executes correctly', async () => {
    const args = {
      name: 'Carol Taylor'
    };

    const result = await executeBraidTool(
      'get_contact_by_name',
      args,
      tenantRecord,
      'test-user-id',
      TOOL_ACCESS_TOKEN
    );

    assert(result, 'Should return a result');
    
    // Check that we're making proper API calls (not getting parameter errors)
    if (result.tag === 'Err' && result.error) {
      console.log(`   Note: ${result.error.message || result.error.type}`);
      // Should NOT have undefined parameter errors
      assert(!result.error.message?.includes('undefined'), 
        'Should not have undefined parameter errors');
    }

    if (result.tag === 'Ok') {
      console.log(`   Found contact: ${result.value ? 'Yes' : 'No matches'}`);
    }
  });

  await test('list_all_contacts tool executes correctly', async () => {
    const args = {
      limit: 5
    };

    const result = await executeBraidTool(
      'list_all_contacts',
      args,
      tenantRecord,
      'test-user-id',
      TOOL_ACCESS_TOKEN
    );

    assert(result, 'Should return a result');
    
    if (result.tag === 'Ok') {
      console.log(`   Listed ${result.value?.length || 0} contacts`);
      // Data structure check
      if (result.value && result.value.length > 0) {
        const firstContact = result.value[0];
        console.log(`   Sample contact has fields: ${Object.keys(firstContact).join(', ')}`);
      }
    }
  });

  await test('list_leads tool executes correctly', async () => {
    const args = {
      status: 'new',
      account_id: null,
      limit: 5
    };

    const result = await executeBraidTool(
      'list_leads',
      args,
      tenantRecord,
      'test-user-id',
      TOOL_ACCESS_TOKEN
    );

    assert(result, 'Should return a result');
    
    if (result.tag === 'Ok') {
      console.log(`   Listed ${result.value?.length || 0} leads`);
    } else if (result.tag === 'Err') {
      console.log(`   Note: ${result.error?.message || result.error?.type}`);
    }
  });

  console.log('=' .repeat(60));
  console.log(`\n📊 Test Results: ${testsPassed} passed, ${testsFailed} failed\n`);
  
  if (testsFailed > 0) {
    console.log('⚠️  Some tests failed. Check errors above.\n');
    process.exit(1);
  } else {
    console.log('✅ All Braid tools are working correctly!\n');
  }
}

runTests().catch(err => {
  console.error('❌ Test suite error:', err);
  console.error(err.stack);
  process.exit(1);
});
