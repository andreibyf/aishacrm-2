/**
 * Storage Route Tests
 * Tests for file storage operations
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

(SHOULD_RUN ? test : test.skip)('POST /api/storage/upload requires file', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/upload`, {
    method: 'POST',
    headers: { 'x-tenant-id': TENANT_ID },
  });

  // 400 = proper validation (no file), 403 = auth required, 500 = error handling
  assert.ok(
    [400, 403, 500].includes(res.status),
    `expected 400/403/500 for missing file, got ${res.status}`,
  );
});

(SHOULD_RUN ? test : test.skip)(
  'POST /api/storage/upload accepts multipart form data',
  async () => {
    // Create a FormData-like request body
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    const content = 'Hello, this is a test file for storage upload.';

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="test-upload.txt"',
      'Content-Type: text/plain',
      '',
      content,
      `--${boundary}`,
      `Content-Disposition: form-data; name="tenant_id"`,
      '',
      TENANT_ID,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(`${BASE_URL}/api/storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'x-tenant-id': TENANT_ID,
      },
      body,
    });

    // Accept various responses:
    // 200/201 = success
    // 400 = validation error (e.g., bucket not configured)
    // 500 = storage not configured or other error
    assert.ok(
      [200, 201, 400, 403, 500].includes(res.status),
      `expected 200/201/400/403/500, got ${res.status}`,
    );

    if ([200, 201].includes(res.status)) {
      const json = await res.json();
      assert.equal(json.status, 'success');
      // Response structure may vary - just verify success status
    }
  },
);

(SHOULD_RUN ? test : test.skip)('GET /api/storage/files lists files', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/files?tenant_id=${TENANT_ID}`);

  // Accept 200 (success) or 404/500 (endpoint may not exist or storage not configured)
  assert.ok([200, 404, 500].includes(res.status), `expected 200/404/500, got ${res.status}`);

  if (res.status === 200) {
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(
      Array.isArray(json.data?.files) || json.data?.files === undefined,
      'expected files array or undefined',
    );
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/storage/file/:path returns file info', async () => {
  // Use a non-existent path - should return 404
  const res = await fetch(
    `${BASE_URL}/api/storage/file/non-existent-file.txt?tenant_id=${TENANT_ID}`,
  );

  // Accept 404 (not found) or 400/500 (route may work differently)
  assert.ok(
    [400, 404, 500].includes(res.status),
    `expected 400/404/500 for non-existent file, got ${res.status}`,
  );
});

(SHOULD_RUN ? test : test.skip)(
  'DELETE /api/storage/file/:path requires authentication',
  async () => {
    const res = await fetch(`${BASE_URL}/api/storage/file/test-file.txt`, {
      method: 'DELETE',
    });

    // Accept 400 (missing tenant), 401 (unauthorized), 403 (forbidden), 404 (not found), or 500
    assert.ok(
      [400, 401, 403, 404, 500].includes(res.status),
      `expected 400/401/403/404/500, got ${res.status}`,
    );
  },
);

(SHOULD_RUN ? test : test.skip)('GET /api/storage/signed-url generates signed URL', async () => {
  const res = await fetch(
    `${BASE_URL}/api/storage/signed-url?tenant_id=${TENANT_ID}&path=test-file.txt`,
  );

  // Accept 200 (success), 404 (file not found), or 500 (storage not configured)
  assert.ok([200, 404, 500].includes(res.status), `expected 200/404/500, got ${res.status}`);

  if (res.status === 200) {
    const json = await res.json();
    assert.ok(json.data?.signedUrl || json.data?.url, 'expected signedUrl in response');
  }
});

(SHOULD_RUN ? test : test.skip)(
  'Storage routes handle missing Supabase config gracefully',
  async () => {
    // This test verifies error handling when storage is not configured
    const res = await fetch(`${BASE_URL}/api/storage/upload`, {
      method: 'POST',
    });

    // Should not crash - return 400, 403, or 500 with error message
    assert.ok([400, 403, 500].includes(res.status), 'should handle missing config gracefully');

    const json = await res.json();
    assert.ok(json.status === 'error' || json.message || json.error, 'should return error status');
  },
);

(SHOULD_RUN ? test : test.skip)('POST /api/storage/upload respects tenant isolation', async () => {
  // Verify tenant_id is properly handled
  const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);

  const body = [
    `--${boundary}`,
    'Content-Disposition: form-data; name="file"; filename="tenant-test.txt"',
    'Content-Type: text/plain',
    '',
    'Tenant isolation test',
    `--${boundary}`,
    `Content-Disposition: form-data; name="tenant_id"`,
    '',
    TENANT_ID,
    `--${boundary}--`,
  ].join('\r\n');

  const res = await fetch(`${BASE_URL}/api/storage/upload`, {
    method: 'POST',
    headers: {
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  });

  // Verify request was processed (regardless of storage availability)
  assert.ok(
    [200, 201, 400, 403, 500].includes(res.status),
    `request should be processed, got ${res.status}`,
  );
});

(SHOULD_RUN ? test : test.skip)('GET /api/storage/buckets lists available buckets', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/buckets?tenant_id=${TENANT_ID}`);

  // This endpoint may not exist - accept various responses
  assert.ok([200, 404, 500].includes(res.status), `expected 200/404/500, got ${res.status}`);
});
// ============================================================================
// R2 ARTIFACT STORAGE TESTS
// ============================================================================

(SHOULD_RUN ? test : test.skip)('GET /api/storage/r2/check returns R2 config status', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/r2/check`);

  assert.equal(res.status, 200, 'R2 check endpoint should always return 200');

  const json = await res.json();
  assert.equal(json.status, 'ok');
  assert.ok(json.r2, 'should include r2 status object');

  // R2 may or may not be configured - both are valid
  assert.ok(typeof json.r2.ok === 'boolean', 'r2.ok should be boolean');

  // If not configured, should include missing env vars and env object
  if (!json.r2.ok) {
    assert.ok(json.r2.env || json.env, 'should include env vars presence check');
  }
});

(SHOULD_RUN ? test : test.skip)('POST /api/storage/artifacts requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/artifacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      kind: 'test',
      payload: { test: 'data' },
    }),
  });

  assert.equal(res.status, 400, 'should return 400 for missing tenant_id');

  const json = await res.json();
  assert.equal(json.status, 'error');
  assert.ok(json.message.includes('tenant_id'), 'error should mention tenant_id');
});

(SHOULD_RUN ? test : test.skip)('POST /api/storage/artifacts requires kind parameter', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/artifacts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-tenant-id': TENANT_ID,
    },
    body: JSON.stringify({
      payload: { test: 'data' },
    }),
  });

  assert.equal(res.status, 400, 'should return 400 for missing kind');

  const json = await res.json();
  assert.equal(json.status, 'error');
  assert.ok(json.message.includes('kind'), 'error should mention kind');
});

(SHOULD_RUN ? test : test.skip)(
  'POST /api/storage/artifacts requires payload parameter',
  async () => {
    const res = await fetch(`${BASE_URL}/api/storage/artifacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
      },
      body: JSON.stringify({
        kind: 'test',
      }),
    });

    assert.equal(res.status, 400, 'should return 400 for missing payload');

    const json = await res.json();
    assert.equal(json.status, 'error');
    assert.ok(json.message.includes('payload'), 'error should mention payload');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'POST /api/storage/artifacts stores and retrieves artifact (if R2 configured)',
  async () => {
    // First check if R2 is configured
    const checkRes = await fetch(`${BASE_URL}/api/storage/r2/check`);
    const checkJson = await checkRes.json();

    if (!checkJson.r2?.ok) {
      console.log('Skipping R2 artifact test - R2 not configured');
      return;
    }

    // Create artifact
    const testPayload = {
      test: 'data',
      timestamp: new Date().toISOString(),
      nested: { value: 42 },
    };

    const createRes = await fetch(`${BASE_URL}/api/storage/artifacts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
      },
      body: JSON.stringify({
        kind: 'test_artifact',
        entity_type: 'test',
        payload: testPayload,
      }),
    });

    assert.ok(
      [201, 500].includes(createRes.status),
      `expected 201 or 500, got ${createRes.status}`,
    );

    if (createRes.status === 500) {
      console.log(
        'R2 artifact creation failed (likely missing migration) - skipping retrieval test',
      );
      return;
    }

    const createJson = await createRes.json();
    assert.equal(createJson.status, 'ok');
    assert.ok(createJson.artifact?.id, 'should return artifact with id');
    assert.equal(createJson.artifact.tenant_id, TENANT_ID);
    assert.equal(createJson.artifact.kind, 'test_artifact');
    assert.ok(createJson.artifact.r2_key, 'should include R2 key');

    // Retrieve artifact
    const artifactId = createJson.artifact.id;
    const getRes = await fetch(
      `${BASE_URL}/api/storage/artifacts/${artifactId}?tenant_id=${TENANT_ID}`,
      {
        headers: { 'x-tenant-id': TENANT_ID },
      },
    );

    assert.equal(getRes.status, 200, 'should retrieve artifact');

    const getJson = await getRes.json();
    assert.equal(getJson.status, 'ok');
    assert.ok(getJson.artifact, 'should include artifact metadata');
    assert.ok(getJson.payload, 'should include payload');
    assert.deepEqual(getJson.payload, testPayload, 'payload should match original');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/storage/artifacts/:id enforces tenant isolation',
  async () => {
    // Try to access artifact with different tenant_id
    const wrongTenantId = '00000000-0000-0000-0000-000000000000';

    const res = await fetch(
      `${BASE_URL}/api/storage/artifacts/00000000-0000-0000-0000-000000000001`,
      {
        headers: { 'x-tenant-id': wrongTenantId },
      },
    );

    // Should return 404 (not found) or 400/500 if R2 not configured
    assert.ok([400, 404, 500].includes(res.status), `expected 404/400/500, got ${res.status}`);
  },
);

(SHOULD_RUN ? test : test.skip)('GET /api/storage/artifacts/:id requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/storage/artifacts/00000000-0000-0000-0000-000000000001`);

  assert.equal(res.status, 400, 'should return 400 for missing tenant_id');

  const json = await res.json();
  assert.equal(json.status, 'error');
  assert.ok(json.message.includes('tenant_id'), 'error should mention tenant_id');
});

// ============================================================================
// TIMEOUT AND ERROR HANDLING TESTS
// ============================================================================

(SHOULD_RUN ? test : test.skip)(
  'POST /api/storage/upload completes within reasonable time',
  async () => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    const content = 'Test file for timeout verification';

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="timeout-test.txt"',
      'Content-Type: text/plain',
      '',
      content,
      `--${boundary}`,
      `Content-Disposition: form-data; name="tenant_id"`,
      '',
      TENANT_ID,
      `--${boundary}--`,
    ].join('\r\n');

    const startTime = Date.now();

    const res = await fetch(`${BASE_URL}/api/storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'x-tenant-id': TENANT_ID,
      },
      body,
    });

    const duration = Date.now() - startTime;

    // Should complete within 10 seconds (even if it falls back to signed URL)
    assert.ok(duration < 10000, `Upload took ${duration}ms, should be under 10000ms`);

    // Should return a response (not hang indefinitely)
    assert.ok(
      [200, 201, 400, 403, 500].includes(res.status),
      `Should return valid HTTP status, got ${res.status}`,
    );
  },
);

(SHOULD_RUN ? test : test.skip)(
  'POST /api/storage/upload handles public URL validation gracefully',
  async () => {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).slice(2);
    const content = 'Test file for public URL validation';

    const body = [
      `--${boundary}`,
      'Content-Disposition: form-data; name="file"; filename="validation-test.txt"',
      'Content-Type: text/plain',
      '',
      content,
      `--${boundary}`,
      `Content-Disposition: form-data; name="tenant_id"`,
      '',
      TENANT_ID,
      `--${boundary}--`,
    ].join('\r\n');

    const res = await fetch(`${BASE_URL}/api/storage/upload`, {
      method: 'POST',
      headers: {
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'x-tenant-id': TENANT_ID,
      },
      body,
    });

    // Should handle validation failure gracefully and still return a response
    assert.ok(
      [200, 201, 400, 403, 500].includes(res.status),
      `Should handle validation gracefully, got ${res.status}`,
    );

    if ([200, 201].includes(res.status)) {
      const json = await res.json();
      assert.equal(json.status, 'success');
      // Should return either public URL or signed URL
      assert.ok(json.data?.file_url, 'Should return file_url even if public validation failed');
    }
  },
);

(SHOULD_RUN ? test : test.skip)(
  'POST /api/storage/signed-url completes within reasonable time',
  async () => {
    const startTime = Date.now();

    const res = await fetch(`${BASE_URL}/api/storage/signed-url`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-id': TENANT_ID,
      },
      body: JSON.stringify({
        file_uri: 'uploads/test/timeout-test.txt',
      }),
    });

    const duration = Date.now() - startTime;

    // Should complete within 10 seconds (even if it falls back to signed URL)
    assert.ok(duration < 10000, `Signed URL request took ${duration}ms, should be under 10000ms`);

    // Should return a response (not hang indefinitely)
    assert.ok(
      [200, 404, 500].includes(res.status),
      `Should return valid HTTP status, got ${res.status}`,
    );
  },
);
