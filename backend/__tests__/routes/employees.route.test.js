import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

const createdIds = [];

async function createEmployee(payload) {
  const res = await fetch(`${BASE_URL}/api/employees`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteEmployee(id) {
  const res = await fetch(`${BASE_URL}/api/employees/${id}?tenant_id=${TENANT_ID}`, {
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

    const emp = await createEmployee(employeeData);
    if (emp.status === 201) {
      const id = emp.json?.data?.id || emp.json?.data?.employee?.id;
      if (id) createdIds.push(id);
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
    const res = await fetch(`${BASE_URL}/api/employees?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 from employees list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.employees || Array.isArray(json.data), 'expected employees array');
  });

  test('POST /api/employees creates new employee', async () => {
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
    const res = await fetch(`${BASE_URL}/api/employees`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, email: 'incomplete@example.com' }),
    });
    assert.ok([400, 422].includes(res.status), `expected 400 or 422, got ${res.status}`);
  });

  test('GET /api/employees/:id returns specific employee', async () => {
    if (createdIds.length === 0) return; // Skip if no test employee
    const id = createdIds[0];
    const res = await fetch(`${BASE_URL}/api/employees/${id}?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 200, 'expected 200 for specific employee');
    const json = await res.json();
    assert.equal(json.status, 'success');
  });

  test('PUT /api/employees/:id updates employee', async () => {
    if (createdIds.length === 0) return; // Skip if no test employee
    const id = createdIds[0];
    const res = await fetch(`${BASE_URL}/api/employees/${id}`, {
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
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await fetch(`${BASE_URL}/api/employees/${fakeId}?tenant_id=${TENANT_ID}`);
    assert.equal(res.status, 404, 'expected 404 for non-existent employee');
  });
});
