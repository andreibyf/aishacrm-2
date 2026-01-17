/**
 * Simple verification script for the tenant_id validation fix
 * This demonstrates the expected behavior after the fix
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = 'a11dfb63-4b18-4eb8-872e-747af2e37c46'; // Test tenant ID

console.log('=== Account tenant_id Validation Verification ===\n');

async function testAccountEndpoint() {
  // Use a known test account ID (replace with actual ID if available)
  const testAccountId = '00000000-0000-0000-0000-000000000001'; // Placeholder

  console.log('Test 1: GET account WITH tenant_id (should work or return 404)');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v2/accounts/${testAccountId}?tenant_id=${TENANT_ID}`);
    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(data).substring(0, 100)}...`);
    if (response.status === 200) {
      console.log('  ✓ Request successful with tenant_id');
    } else if (response.status === 404) {
      console.log('  ✓ Account not found (expected for placeholder ID)');
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
  }

  console.log('\nTest 2: GET account WITHOUT tenant_id (should return 400)');
  try {
    const response = await fetch(`${BACKEND_URL}/api/v2/accounts/${testAccountId}`);
    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(data)}`);
    if (response.status === 400 && data.message && data.message.includes('tenant_id')) {
      console.log('  ✓ Correctly rejects request without tenant_id');
    } else {
      console.log('  ✗ Unexpected response (should be 400 with tenant_id required message)');
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
  }

  console.log('\nTest 3: V1 endpoint WITH tenant_id (should work or return 404)');
  try {
    const response = await fetch(`${BACKEND_URL}/api/accounts/${testAccountId}?tenant_id=${TENANT_ID}`);
    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(data).substring(0, 100)}...`);
    if (response.status === 200) {
      console.log('  ✓ V1 request successful with tenant_id');
    } else if (response.status === 404) {
      console.log('  ✓ Account not found (expected for placeholder ID)');
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
  }

  console.log('\nTest 4: V1 endpoint WITHOUT tenant_id (should return 400 after fix)');
  try {
    const response = await fetch(`${BACKEND_URL}/api/accounts/${testAccountId}`);
    const data = await response.json();
    console.log(`  Status: ${response.status}`);
    console.log(`  Response: ${JSON.stringify(data)}`);
    if (response.status === 400 && data.message && data.message.includes('tenant_id')) {
      console.log('  ✓ V1 endpoint correctly rejects request without tenant_id');
    } else {
      console.log('  ✗ Unexpected response (should be 400 with tenant_id required message)');
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}`);
  }
}

// Check if backend is running
fetch(`${BACKEND_URL}/health`)
  .then(response => {
    if (response.ok) {
      console.log(`Backend is running at ${BACKEND_URL}\n`);
      return testAccountEndpoint();
    } else {
      console.log(`Backend returned ${response.status}`);
      console.log('Note: Start the backend with `npm run dev` to run these tests');
    }
  })
  .catch(err => {
    console.log(`Cannot connect to backend at ${BACKEND_URL}`);
    console.log('Note: Start the backend with `npm run dev` to run these tests');
    console.log(`Error: ${err.message}\n`);
    console.log('Expected behavior after fix:');
    console.log('  - Requests with tenant_id: ✓ 200/404');
    console.log('  - Requests without tenant_id: ✓ 400 "tenant_id is required"');
  });
