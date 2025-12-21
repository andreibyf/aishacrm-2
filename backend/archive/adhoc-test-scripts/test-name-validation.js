/**
 * Test script for first_name/last_name validation on Leads and Contacts
 * Run: node backend/test-name-validation.js
 */

const testCases = [
  {
    entity: 'Contact',
    endpoint: 'http://localhost:3001/api/contacts',
    validData: {
      tenant_id: 'test-tenant',
      first_name: 'John',
      last_name: 'Doe',
      email: 'john.doe@example.com'
    },
    invalidCases: [
      { data: { tenant_id: 'test-tenant', last_name: 'Doe' }, missing: 'first_name' },
      { data: { tenant_id: 'test-tenant', first_name: 'John' }, missing: 'last_name' },
      { data: { tenant_id: 'test-tenant', first_name: '   ', last_name: 'Doe' }, missing: 'first_name (whitespace)' },
      { data: { tenant_id: 'test-tenant', first_name: 'John', last_name: '   ' }, missing: 'last_name (whitespace)' }
    ]
  },
  {
    entity: 'Lead',
    endpoint: 'http://localhost:3001/api/leads',
    validData: {
      tenant_id: 'test-tenant',
      first_name: 'Jane',
      last_name: 'Smith',
      email: 'jane.smith@example.com',
      status: 'new'
    },
    invalidCases: [
      { data: { tenant_id: 'test-tenant', last_name: 'Smith', status: 'new' }, missing: 'first_name' },
      { data: { tenant_id: 'test-tenant', first_name: 'Jane', status: 'new' }, missing: 'last_name' },
      { data: { tenant_id: 'test-tenant', first_name: '   ', last_name: 'Smith', status: 'new' }, missing: 'first_name (whitespace)' },
      { data: { tenant_id: 'test-tenant', first_name: 'Jane', last_name: '   ', status: 'new' }, missing: 'last_name (whitespace)' }
    ]
  }
];

async function runTests() {
  console.log('\n🧪 Testing Backend Name Validation\n');
  console.log('=' .repeat(60));

  for (const testCase of testCases) {
    console.log(`\n${testCase.entity} Validation Tests:`);
    console.log('-'.repeat(60));

    // Test invalid cases (should fail with 400)
    for (const invalidCase of testCase.invalidCases) {
      try {
        const response = await fetch(testCase.endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer test-token' // Mock token for testing
          },
          body: JSON.stringify(invalidCase.data)
        });

        const result = await response.json();

        if (response.status === 400) {
          console.log(`  ✅ PASS: ${invalidCase.missing} rejected with 400`);
          console.log(`     Message: "${result.message}"`);
          if (result.field) {
            console.log(`     Field: ${result.field}`);
          }
        } else {
          console.log(`  ❌ FAIL: ${invalidCase.missing} should return 400, got ${response.status}`);
          console.log(`     Response:`, result);
        }
      } catch (error) {
        console.log(`  ⚠️  ERROR testing ${invalidCase.missing}:`, error.message);
      }
    }

    console.log('');
  }

  console.log('=' .repeat(60));
  console.log('\n✅ Validation tests complete!\n');
  console.log('Note: Authorization errors (401) are expected if not using valid tokens.');
  console.log('The important part is that 400 errors are returned for missing names.\n');
}

// Run the tests
runTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});
