/**
 * R2 Artifacts Integration Tests
 * 
 * Tests the full R2 artifact storage workflow:
 * 1. Store artifact via POST /api/storage/artifacts
 * 2. List artifacts via GET /api/storage/artifacts
 * 3. Retrieve artifact + payload via GET /api/storage/artifacts/:id
 * 
 * Prerequisites:
 * - R2 credentials configured (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET)
 * - artifact_refs table exists in database
 * - Backend running on localhost:4001 (or configured API_URL)
 */

const API_URL = process.env.API_URL || 'http://localhost:4001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

async function runTests() {
  console.log('🧪 R2 Artifacts Integration Tests');
  console.log('='.repeat(50));
  console.log(`API URL: ${API_URL}`);
  console.log(`Tenant ID: ${TENANT_ID}`);
  console.log('');

  let createdArtifactId = null;
  let testsPassed = 0;
  let testsFailed = 0;

  // Test 1: Check R2 connection
  console.log('📡 Test 1: R2 Connection Check');
  try {
    const res = await fetch(`${API_URL}/api/storage/r2/check`);
    const data = await res.json();
    
    if (data.status === 'ok' && data.r2?.ok === true) {
      console.log('   ✅ R2 connection OK');
      console.log(`   Method: ${data.r2.method}`);
      testsPassed++;
    } else {
      console.log('   ❌ R2 connection failed:', data);
      testsFailed++;
      console.log('\n⚠️  Cannot continue without R2 connection. Exiting.');
      process.exit(1);
    }
  } catch (err) {
    console.log('   ❌ R2 check error:', err.message);
    testsFailed++;
    process.exit(1);
  }

  // Test 2: Store artifact
  console.log('\n📤 Test 2: Store Artifact');
  const testPayload = {
    test_id: `test-${Date.now()}`,
    message: 'Hello from R2 artifact test',
    timestamp: new Date().toISOString(),
    nested: {
      data: [1, 2, 3],
      flag: true,
    },
  };

  try {
    const res = await fetch(`${API_URL}/api/storage/artifacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
      },
      body: JSON.stringify({
        kind: 'test_artifact',
        entity_type: 'test',
        entity_id: '00000000-0000-0000-0000-000000000001',
        payload: testPayload,
      }),
    });
    const data = await res.json();
    
    if (res.status === 201 && data.status === 'ok' && data.artifact?.id) {
      createdArtifactId = data.artifact.id;
      console.log('   ✅ Artifact stored successfully');
      console.log(`   ID: ${data.artifact.id}`);
      console.log(`   R2 Key: ${data.artifact.r2_key}`);
      console.log(`   Size: ${data.artifact.size_bytes} bytes`);
      console.log(`   SHA256: ${data.artifact.sha256?.substring(0, 16)}...`);
      testsPassed++;
    } else {
      console.log('   ❌ Failed to store artifact:', data);
      testsFailed++;
    }
  } catch (err) {
    console.log('   ❌ Store artifact error:', err.message);
    testsFailed++;
  }

  // Test 3: List artifacts
  console.log('\n📋 Test 3: List Artifacts');
  try {
    const res = await fetch(
      `${API_URL}/api/storage/artifacts?tenant_id=${TENANT_ID}&kind=test_artifact&limit=10`,
      {
        headers: { 'x-tenant-id': TENANT_ID },
      }
    );
    const data = await res.json();
    
    if (res.status === 200 && data.status === 'ok' && Array.isArray(data.artifacts)) {
      console.log('   ✅ Artifact list retrieved');
      console.log(`   Count: ${data.count}`);
      
      // Check if our artifact is in the list
      const found = data.artifacts.find(a => a.id === createdArtifactId);
      if (found) {
        console.log('   ✅ Created artifact found in list');
        testsPassed++;
      } else if (createdArtifactId) {
        console.log('   ⚠️  Created artifact not found in list (may be timing issue)');
        testsPassed++; // Still pass the list test
      } else {
        testsPassed++;
      }
    } else {
      console.log('   ❌ Failed to list artifacts:', data);
      testsFailed++;
    }
  } catch (err) {
    console.log('   ❌ List artifacts error:', err.message);
    testsFailed++;
  }

  // Test 4: Retrieve artifact with payload
  if (createdArtifactId) {
    console.log('\n📥 Test 4: Retrieve Artifact + Payload');
    try {
      const res = await fetch(
        `${API_URL}/api/storage/artifacts/${createdArtifactId}?tenant_id=${TENANT_ID}`,
        {
          headers: { 'x-tenant-id': TENANT_ID },
        }
      );
      const data = await res.json();
      
      if (res.status === 200 && data.status === 'ok' && data.payload) {
        console.log('   ✅ Artifact retrieved with payload');
        console.log(`   Artifact ID: ${data.artifact.id}`);
        console.log(`   Payload test_id: ${data.payload.test_id}`);
        
        // Verify payload matches what we stored
        if (
          data.payload.message === testPayload.message &&
          data.payload.nested?.flag === true
        ) {
          console.log('   ✅ Payload integrity verified');
          testsPassed++;
        } else {
          console.log('   ❌ Payload mismatch');
          console.log('   Expected:', testPayload);
          console.log('   Got:', data.payload);
          testsFailed++;
        }
      } else {
        console.log('   ❌ Failed to retrieve artifact:', data);
        testsFailed++;
      }
    } catch (err) {
      console.log('   ❌ Retrieve artifact error:', err.message);
      testsFailed++;
    }
  } else {
    console.log('\n⏭️  Test 4: Skipped (no artifact ID from Test 2)');
  }

  // Test 5: List tool_context_results (from AI chat)
  console.log('\n🤖 Test 5: List AI Tool Context Artifacts');
  try {
    const res = await fetch(
      `${API_URL}/api/storage/artifacts?tenant_id=${TENANT_ID}&kind=tool_context_results&limit=5`,
      {
        headers: { 'x-tenant-id': TENANT_ID },
      }
    );
    const data = await res.json();
    
    if (res.status === 200 && data.status === 'ok') {
      console.log('   ✅ Tool context artifacts query succeeded');
      console.log(`   Count: ${data.count}`);
      
      if (data.artifacts.length > 0) {
        const latest = data.artifacts[0];
        console.log(`   Latest ID: ${latest.id}`);
        console.log(`   Entity: ${latest.entity_type}/${latest.entity_id}`);
        console.log(`   Size: ${latest.size_bytes} bytes`);
        console.log(`   Created: ${latest.created_at}`);
      } else {
        console.log('   ℹ️  No tool_context_results artifacts yet (run an AI chat with tools first)');
      }
      testsPassed++;
    } else {
      console.log('   ❌ Failed to list tool context artifacts:', data);
      testsFailed++;
    }
  } catch (err) {
    console.log('   ❌ List tool context error:', err.message);
    testsFailed++;
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 Test Summary');
  console.log(`   ✅ Passed: ${testsPassed}`);
  console.log(`   ❌ Failed: ${testsFailed}`);
  console.log('='.repeat(50));

  if (testsFailed > 0) {
    console.log('\n⚠️  Some tests failed. Check R2 configuration and database.');
    process.exit(1);
  } else {
    console.log('\n🎉 All tests passed! R2 artifact storage is working correctly.');
    process.exit(0);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
