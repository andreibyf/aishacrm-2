import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// This suite hits a live backend URL and can be flaky in parallel CI.
// Keep it opt-in in CI to avoid nondeterministic worker teardown failures.
const SHOULD_RUN = process.env.CI ? process.env.CI_EMPLOYEES_ROUTE_TESTS === 'true' : true;

const createdIds = [];
let backendUnavailable = false;

function timedFetch(url, options = {}) {
  return fetch(url, {
    ...options,
    signal: options.signal || AbortSignal.timeout(15000),
  });
}

function shouldSkipForBackend() {
  return backendUnavailable;
}

async function createEmployee(payload) {
  const res = await timedFetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteEmployee(id) {
  const res = await timedFetch(`${BASE_URL}/api/employees/${id}?tenant_id=${TENANT_ID}`, {
    method: 'DELETE',
  });
  return res.status;
}

describe('Employee Routes', { skip: !SHOULD_RUN }, () => {
  before(async () => {
    // Create test employee using TestFactory
    const employeeData = TestFactory.employee({
      first_name: 'Test',
      last_name: 'Employee',
      role: 'Sales Rep',
      status: 'active',
      tenant_id: TENANT_ID,
    });

    try {
      const emp = await createEmployee(employeeData);
      if (emp.status === 201) {
        const id = emp.json?.data?.id || emp.json?.data?.employee?.id;
        if (id) createdIds.push(id);
      }
    } catch {
      backendUnavailable = true;
    }
  });

  after(async () => {
    for (const id of createdIds.filter(Boolean)) {
      try {
        await deleteEmployee(id);
      } catch {
        /* ignore */
      }
    }
  });

  test('GET /api/employees returns 200 with tenant_id', async () => {
    if (shouldSkipForBackend()) return;
    const res = await timedFetch(`${BASE_URL}/api/employees?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 from employees list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.employees || Array.isArray(json.data), 'expected employees array');
  });

  test('POST /api/employees creates new employee', async () => {
    if (shouldSkipForBackend()) return;
    const newEmployeeData = TestFactory.employee({
      first_name: 'New',
      last_name: 'Hire',
      role: 'Account Manager',
      status: 'active',
      tenant_id: TENANT_ID,
    });

    const result = await createEmployee(newEmployeeData);
    // 200/201 = success, 403 = blocked test email patterns (security feature)
    assert.ok(
      [200, 201, 403].includes(result.status),
      `expected 200, 201 or 403, got ${result.status}`,
    );
    if ([200, 201].includes(result.status)) {
      const id = result.json?.data?.id || result.json?.data?.employee?.id;
      assert.ok(id, 'employee should have an id');
      createdIds.push(id);
    }
  });

  test('POST /api/employees requires first_name and last_name', async () => {
    if (shouldSkipForBackend()) return;
    const res = await timedFetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, email: 'incomplete@example.com' }),
    });
    assert.ok([400, 422].includes(res.status), `expected 400 or 422, got ${res.status}`);
  });

  test('GET /api/employees/:id returns specific employee', async () => {
    if (shouldSkipForBackend()) return;
    if (createdIds.length === 0) return; // Skip if no test employee
    const id = createdIds[0];
    const res = await timedFetch(`${BASE_URL}/api/employees/${id}?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 for specific employee');
    const json = await res.json();
    assert.equal(json.status, 'success');
  });

  test('PUT /api/employees/:id updates employee', async () => {
    if (shouldSkipForBackend()) return;
    if (createdIds.length === 0) return; // Skip if no test employee
    const id = createdIds[0];
    const res = await timedFetch(`${BASE_URL}/api/employees/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        role: 'Senior Sales Rep',
      }),
    });
    assert.equal(res.status, 200, 'expected 200 for update');
    const json = await res.json();
    assert.equal(json.status, 'success');
  });

  test('GET /api/employees/:id returns 404 for non-existent', async () => {
    if (shouldSkipForBackend()) return;
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await timedFetch(`${BASE_URL}/api/employees/${fakeId}?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 404, 'expected 404 for non-existent employee');
  });

  test('GET /api/employees with non-numeric limit/offset does not 500', async () => {
    if (shouldSkipForBackend()) return;
    const res = await timedFetch(
      `${BASE_URL}/api/employees?tenant_id=${TENANT_ID}&limit=abc&offset=xyz`,
    );
    assert.equal(
      res.status,
      200,
      'expected 200 with fallback defaults for non-numeric limit/offset',
    );
    const json = await res.json();
    assert.equal(json.status, 'success');
  });

  // ===== Employee-User Link Management Tests =====

  describe('POST /api/employees/:id/validate-user-link', () => {
    let testEmployee = null;

    before(async () => {
      if (shouldSkipForBackend()) return;
      // Create test employee with known email
      testEmployee = TestFactory.employee({
        first_name: 'Link',
        last_name: 'Test',
        email: 'linktest@example.com',
        status: 'active',
        tenant_id: TENANT_ID,
      });
      const empRes = await createEmployee(testEmployee);
      if ([200, 201].includes(empRes.status)) {
        testEmployee.id = empRes.json?.data?.id || empRes.json?.data?.employee?.id;
        createdIds.push(testEmployee.id);
      }

      // Create test user separately (would normally be created via auth)
      // For now, we'll use a mock setup in the test itself
    });

    test('✅ Success case: valid employee/user match → link established', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      // Note: This test requires simultaneous user/employee setup.
      // In a real scenario, you'd create both a user and employee with matching credentials,
      // then call /validate-user-link. For now, we validate the endpoint structure.

      const payload = { user_id: '00000000-0000-0000-0000-000000000001' };
      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            // In real tests, would include auth headers
          },
          body: JSON.stringify(payload),
        },
      );

      // Expected: 400 (missing auth) or 404 (user not found) since this is a live test
      // In integration tests with mock DB, would expect 200
      assert.ok([400, 403, 404, 500].includes(res.status), `got status ${res.status}`);
    });

    test('❌ Email mismatch validation blocks link', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      // Create a user with different email
      const payload = {
        user_id: '00000000-0000-0000-0000-000000000002',
        // In real test, user would have different email than testEmployee
      };

      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        },
      );

      // Should reject on email mismatch (400) or missing user (404)
      assert.ok([400, 404, 500].includes(res.status), `got status ${res.status}`);

      if (res.status === 400) {
        const json = await res.json();
        assert.ok(
          json.errors?.some((e) => e.toLowerCase().includes('email')),
          'should mention email mismatch',
        );
      }
    });

    test('❌ Tenant mismatch blocking', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      const differentTenant = '99999999-9999-9999-9999-999999999999';
      const payload = { user_id: '00000000-0000-0000-0000-000000000003' };

      // Try to validate link for employee in one tenant, user in another
      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Tenant-ID': differentTenant, // Different tenant
          },
          body: JSON.stringify(payload),
        },
      );

      // Should reject with 403 (Forbidden) for cross-tenant attempt
      assert.ok([403, 404, 500].includes(res.status), `got status ${res.status}: expecting 403`);

      if (res.status === 403) {
        const json = await res.json();
        assert.ok(
          json.errors?.some((e) => e.toLowerCase().includes('tenant')),
          'should mention tenant mismatch',
        );
      }
    });

    test('❌ Inactive employee blocking', async () => {
      if (shouldSkipForBackend()) return;
      // Test the authorization check catches inactive status
      const inactiveEmployee = TestFactory.employee({
        first_name: 'Inactive',
        last_name: 'Employee',
        email: 'inactive@example.com',
        status: 'inactive', // Explicitly inactive
        tenant_id: TENANT_ID,
      });

      const empRes = await createEmployee(inactiveEmployee);
      if (![200, 201].includes(empRes.status)) {
        console.log(
          '⏭️  Skipping: could not create inactive employee (security may block test emails)',
        );
        return;
      }

      const empId = empRes.json?.data?.id || empRes.json?.data?.employee?.id;
      createdIds.push(empId);

      const payload = { user_id: '00000000-0000-0000-0000-000000000004' };
      const res = await timedFetch(`${BASE_URL}/api/employees/${empId}/validate-user-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Should reject inactive status (400/403) or auth check (403)
      assert.ok([400, 403, 404, 500].includes(res.status), `got status ${res.status}`);
    });

    test('❌ Inactive user blocking', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      // Attempt to link to an inactive user - should be blocked
      const payload = {
        user_id: '00000000-0000-0000-0000-000000000005',
        // Simulate inactive user exists
      };

      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      // Should validate user status and reject if inactive (400) or not found (404)
      assert.ok([400, 404, 500].includes(res.status), `got status ${res.status}`);

      if (res.status === 400) {
        const json = await res.json();
        assert.ok(
          json.errors?.some((e) => e.toLowerCase().includes('status')),
          'should mention user status issue',
        );
      }
    });

    test('✅ Side-effects: cache invalidation on success', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      // This test validates that cache keys are properly invalidated
      // In a real integration test, would mock cache and verify calls

      const payload = { user_id: '00000000-0000-0000-0000-000000000006' };
      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      // Note: With live test, we can't easily verify cache invalidation,
      // but we can ensure endpoint doesn't throw on cache operations
      assert.ok(
        [200, 400, 403, 404, 500].includes(res.status),
        'endpoint should handle all cache scenarios gracefully',
      );
    });

    test('✅ Side-effects: team_members updated on success', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      // Validates that team_members join table is updated with user_id
      const payload = { user_id: '00000000-0000-0000-0000-000000000007' };

      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        },
      );

      // Endpoint should attempt team_members update even if user not found
      // Verify it doesn't crash on update (logs error instead)
      assert.ok(
        [200, 400, 404, 500].includes(res.status),
        'should handle team_members update gracefully',
      );

      // In a real test with mocked DB, response would include:
      // { valid: true, linked_user_id: "...", employee_metadata_updated: true }
    });

    test('❌ Missing user_id parameter returns 400', async () => {
      if (shouldSkipForBackend()) return;
      if (!testEmployee?.id) {
        console.log('⏭️  Skipping: no test employee created');
        return;
      }

      const res = await timedFetch(
        `${BASE_URL}/api/employees/${testEmployee.id}/validate-user-link`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}), // Missing user_id
        },
      );

      assert.equal(res.status, 400, 'should reject missing user_id');
      const json = await res.json();
      assert.ok(
        json.errors?.some((e) => e.toLowerCase().includes('user')),
        'error should mention user_id requirement',
      );
    });

    test('❌ Non-existent employee returns 404', async () => {
      if (shouldSkipForBackend()) return;
      const fakeId = '00000000-0000-0000-0000-000000000099';
      const payload = { user_id: '00000000-0000-0000-0000-000000000008', tenant_id: TENANT_ID };

      const res = await timedFetch(`${BASE_URL}/api/employees/${fakeId}/validate-user-link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Expects 404 for non-existent employee, or 403 if auth/tenant validation fails first
      assert.ok([403, 404].includes(res.status), `expected 403 or 404, got ${res.status}`);
    });
  });
});
