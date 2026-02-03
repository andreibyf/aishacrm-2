/**
 * Quick test to verify Braid search_contacts parameter fix
 * Tests that searchContacts parameters are correctly mapped to positional args
 */

import { objectToPositionalArgs } from './lib/braid/analysis.js';

// Test timeout (10 seconds)
const TEST_TIMEOUT = 10000;
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  return Promise.race([
    fn(),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error(`Test timeout: ${name}`)), TEST_TIMEOUT)
    )
  ]).then(() => {
    console.log(`✅ PASS: ${name}`);
    testsPassed++;
  }).catch(err => {
    console.error(`❌ FAIL: ${name}`);
    console.error(`   ${err.message}`);
    testsFailed++;
  });
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

async function runTests() {
  console.log('\n🧪 Testing Braid Parameter Mapping Fix\n');
  console.log('=' .repeat(60));

  await test('searchContacts maps parameters correctly', async () => {
    const args = {
      tenant: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      query: 'Carol Taylor',
      limit: 10
    };
    
    const positional = objectToPositionalArgs('search_contacts', args);
    
    // Should return array with 3 elements in correct order
    assert(Array.isArray(positional), 'Should return array');
    assert(positional.length === 3, `Should have 3 elements, got ${positional.length}`);
    assert(positional[0] === args.tenant, `First param should be tenant UUID, got ${positional[0]}`);
    assert(positional[1] === args.query, `Second param should be query, got ${positional[1]}`);
    assert(positional[2] === args.limit, `Third param should be limit, got ${positional[2]}`);
  });

  await test('searchLeads maps parameters correctly', async () => {
    const args = {
      tenant: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      query: 'Jimmy Jam',
      limit: 10
    };
    
    const positional = objectToPositionalArgs('search_leads', args);
    
    assert(Array.isArray(positional), 'Should return array');
    assert(positional.length === 3, `Should have 3 elements, got ${positional.length}`);
    assert(positional[0] === args.tenant, `First param should be tenant UUID`);
    assert(positional[1] === args.query, `Second param should be query`);
    assert(positional[2] === args.limit, `Third param should be limit`);
  });

  await test('listContactsForAccount maps parameters correctly', async () => {
    const args = {
      tenant: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      account_id: '123-456-789',
      limit: 20
    };
    
    const positional = objectToPositionalArgs('list_contacts_for_account', args);
    
    assert(Array.isArray(positional), 'Should return array');
    assert(positional.length === 3, 'Should have 3 elements');
    assert(positional[0] === args.tenant, 'First param should be tenant');
    assert(positional[1] === args.account_id, 'Second param should be account_id');
    assert(positional[2] === args.limit, 'Third param should be limit');
  });

  await test('getContactByName maps parameters correctly', async () => {
    const args = {
      tenant: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      name: 'Carol Taylor'
    };
    
    const positional = objectToPositionalArgs('get_contact_by_name', args);
    
    assert(Array.isArray(positional), 'Should return array');
    assert(positional.length === 2, 'Should have 2 elements');
    assert(positional[0] === args.tenant, 'First param should be tenant');
    assert(positional[1] === args.name, 'Second param should be name');
  });

  await test('Bug regression: args NOT nested in first parameter', async () => {
    const args = {
      tenant: 'a11dfb63-4b18-4eb8-872e-747af2e37c46',
      query: 'Carol Taylor',
      limit: 10
    };
    
    const positional = objectToPositionalArgs('search_contacts', args);
    
    // Bug would return: [{tenant: "...", query: "...", limit: ...}]
    // Fixed should return: ["uuid", "Carol Taylor", 10]
    
    // Ensure first element is NOT an object
    assert(typeof positional[0] !== 'object', 
      'REGRESSION: First parameter should be string (tenant UUID), not nested object');
    
    // Ensure we don't have the whole args object as first param
    assert(positional[0] !== args, 
      'REGRESSION: First parameter should not be the entire args object');
    
    assert(typeof positional[0] === 'string', 
      'First parameter should be string tenant UUID');
  });

  console.log('=' .repeat(60));
  console.log(`\n📊 Test Results: ${testsPassed} passed, ${testsFailed} failed\n`);
  
  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test suite error:', err);
  process.exit(1);
});
