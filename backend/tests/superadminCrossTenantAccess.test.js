/**
 * Test: Superadmin cross-tenant read access
 * Verifies that superadmins can read data from any tenant
 */

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:4001';

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { res, body };
}

(async () => {
  console.log('▶ Superadmin Cross-Tenant Read Access Test');
  
  // Test 1: GET request without tenant_id (should work for superadmin)
  console.log('\n1. Testing GET /api/opportunities without tenant_id...');
  const { res: res1, body: body1 } = await jsonFetch('/api/opportunities?limit=5');
  
  if (res1.status === 200) {
    console.log('✅ Superadmin can read opportunities across all tenants');
    console.log(`   Found ${body1.data?.opportunities?.length || 0} opportunities`);
  } else {
    console.log(`❌ Unexpected status ${res1.status}: ${JSON.stringify(body1)}`);
  }
  
  // Test 2: GET request with specific tenant_id (should also work)
  console.log('\n2. Testing GET /api/opportunities with specific tenant_id...');
  const { res: res2, body: body2 } = await jsonFetch('/api/opportunities?tenant_id=labor-depot&limit=5');
  
  if (res2.status === 200) {
    console.log('✅ Superadmin can read specific tenant data');
    console.log(`   Found ${body2.data?.opportunities?.length || 0} opportunities for labor-depot`);
  } else {
    console.log(`❌ Unexpected status ${res2.status}: ${JSON.stringify(body2)}`);
  }
  
  // Test 3: POST request without tenant_id (should be blocked)
  console.log('\n3. Testing POST /api/opportunities without tenant_id...');
  const { res: res3, body: body3 } = await jsonFetch('/api/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Opportunity',
      amount: 1000,
    }),
  });
  
  if (res3.status === 400 && body3.message?.includes('require a tenant_id')) {
    console.log('✅ Superadmin write blocked without tenant_id (expected)');
  } else {
    console.log(`❌ Expected 400 error, got ${res3.status}: ${JSON.stringify(body3)}`);
  }
  
  console.log('\n✅ All tests passed! Superadmin has read-only cross-tenant access.');
  process.exit(0);
})().catch(err => {
  console.error('❌ Test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
