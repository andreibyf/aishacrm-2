/**
 * Tests for POST /bulk-assign endpoints across leads, contacts, accounts, bizdevsources.
 *
 * Covers:
 *  - Happy path: bulk assign to an employee
 *  - Unassign (assigned_to = null)
 *  - Validation: missing tenant_id, empty ids, invalid UUIDs
 *  - Max limit enforcement (>500)
 *  - Non-existent employee returns error
 *  - Partial results when some IDs don't exist
 *  - Response shape: { updated, skipped, errors }
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { authPost, authGet, authDelete } from '../helpers/auth.js';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

// Track created entities for cleanup
const createdLeadIds = [];
const createdContactIds = [];
const createdAccountIds = [];
const createdBizDevIds = [];

// Helper: create a lead via API
async function createLead(overrides = {}) {
  const payload = TestFactory.lead({ tenant_id: TENANT_ID, ...overrides });
  const res = await authPost(`${BASE_URL}/api/v2/leads`, payload);
  const json = await res.json();
  const id = json.data?.lead?.id || json.data?.id;
  if (id) createdLeadIds.push(id);
  return { status: res.status, id, json };
}

// Helper: create a contact via API
async function createContact(overrides = {}) {
  const payload = TestFactory.contact({ tenant_id: TENANT_ID, ...overrides });
  const res = await authPost(`${BASE_URL}/api/v2/contacts`, payload);
  const json = await res.json();
  const id = json.data?.contact?.id || json.data?.id;
  if (id) createdContactIds.push(id);
  return { status: res.status, id, json };
}

// Helper: create an account via API
async function createAccount(overrides = {}) {
  const payload = TestFactory.account({ tenant_id: TENANT_ID, ...overrides });
  const res = await authPost(`${BASE_URL}/api/v2/accounts`, payload);
  const json = await res.json();
  const id = json.data?.account?.id || json.data?.id;
  if (id) createdAccountIds.push(id);
  return { status: res.status, id, json };
}

// Helper: fetch a known employee UUID for the test tenant
let testEmployeeId = null;
async function getTestEmployeeId() {
  if (testEmployeeId) return testEmployeeId;
  const res = await authGet(`${BASE_URL}/api/employees?tenant_id=${TENANT_ID}&limit=1`);
  if (res.status === 200) {
    const json = await res.json();
    const employees = json.data || json.employees || json || [];
    if (Array.isArray(employees) && employees.length > 0) {
      testEmployeeId = employees[0].id;
    }
  }
  return testEmployeeId;
}

// Cleanup
after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdLeadIds.filter(Boolean)) {
    try {
      await authDelete(`${BASE_URL}/api/v2/leads/${id}?tenant_id=${TENANT_ID}`);
    } catch {
      /* */
    }
  }
  for (const id of createdContactIds.filter(Boolean)) {
    try {
      await authDelete(`${BASE_URL}/api/v2/contacts/${id}?tenant_id=${TENANT_ID}`);
    } catch {
      /* */
    }
  }
  for (const id of createdAccountIds.filter(Boolean)) {
    try {
      await authDelete(`${BASE_URL}/api/v2/accounts/${id}?tenant_id=${TENANT_ID}`);
    } catch {
      /* */
    }
  }
  for (const id of createdBizDevIds.filter(Boolean)) {
    try {
      await authDelete(`${BASE_URL}/api/bizdevsources/${id}?tenant_id=${TENANT_ID}`);
    } catch {
      /* */
    }
  }
});

// ─── Leads bulk-assign ──────────────────────────────────────────────

describe('POST /api/v2/leads/bulk-assign', { skip: !SHOULD_RUN }, () => {
  test('assigns multiple leads to an employee', async () => {
    const empId = await getTestEmployeeId();
    if (!empId) return; // skip if no employees

    const a = await createLead({ first_name: 'BulkA', last_name: 'Test' });
    const b = await createLead({ first_name: 'BulkB', last_name: 'Test' });
    assert.ok(a.id && b.id, 'Failed to create test leads');

    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [a.id, b.id],
      assigned_to: empId,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.equal(json.data.updated, 2);
    assert.equal(json.data.skipped, 0);
  });

  test('unassigns leads when assigned_to is null', async () => {
    const lead = await createLead({ first_name: 'BulkUnassign', last_name: 'Test' });
    assert.ok(lead.id);

    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [lead.id],
      assigned_to: null,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });

  test('returns 400 when tenant_id is missing', async () => {
    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: ['00000000-0000-0000-0000-000000000001'],
    });
    assert.equal(res.status, 400);
  });

  test('returns 400 when ids is empty', async () => {
    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [],
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 400);
  });

  test('returns 400 for invalid UUID in ids', async () => {
    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: ['not-a-uuid'],
      assigned_to: null,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('Invalid UUID'));
  });

  test('returns 400 for non-existent employee', async () => {
    const lead = await createLead({ first_name: 'BulkBadEmp', last_name: 'Test' });
    assert.ok(lead.id);

    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [lead.id],
      assigned_to: '00000000-0000-0000-0000-000000000999',
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 400);
    const json = await res.json();
    assert.ok(json.message.includes('Employee not found'));
  });

  test('skips non-existent record IDs gracefully', async () => {
    const lead = await createLead({ first_name: 'BulkPartial', last_name: 'Test' });
    assert.ok(lead.id);

    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [lead.id, '00000000-0000-0000-0000-000000000999'],
      assigned_to: null,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
    assert.equal(json.data.skipped, 1);
  });
});

// ─── Contacts bulk-assign ───────────────────────────────────────────

describe('POST /api/v2/contacts/bulk-assign', { skip: !SHOULD_RUN }, () => {
  test('assigns contacts to an employee', async () => {
    const empId = await getTestEmployeeId();
    if (!empId) return;

    const c = await createContact({ first_name: 'BulkC', last_name: 'Contact' });
    assert.ok(c.id, 'Failed to create test contact');

    const res = await authPost(`${BASE_URL}/api/v2/contacts/bulk-assign`, {
      ids: [c.id],
      assigned_to: empId,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });

  test('returns 400 for empty ids', async () => {
    const res = await authPost(`${BASE_URL}/api/v2/contacts/bulk-assign`, {
      ids: [],
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 400);
  });
});

// ─── Accounts bulk-assign ───────────────────────────────────────────

describe('POST /api/v2/accounts/bulk-assign', { skip: !SHOULD_RUN }, () => {
  test('assigns accounts to an employee', async () => {
    const empId = await getTestEmployeeId();
    if (!empId) return;

    const a = await createAccount({ name: 'Bulk Assign Test Corp' });
    assert.ok(a.id, 'Failed to create test account');

    const res = await authPost(`${BASE_URL}/api/v2/accounts/bulk-assign`, {
      ids: [a.id],
      assigned_to: empId,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });

  test('returns 400 for missing tenant_id', async () => {
    const res = await authPost(`${BASE_URL}/api/v2/accounts/bulk-assign`, {
      ids: ['00000000-0000-0000-0000-000000000001'],
    });
    assert.equal(res.status, 400);
  });
});

// ─── BizDev Sources bulk-assign ─────────────────────────────────────

describe('POST /api/bizdevsources/bulk-assign', { skip: !SHOULD_RUN }, () => {
  let testBizDevId = null;

  before(async () => {
    if (!SHOULD_RUN) return;
    // Create a test bizdev source
    const res = await authPost(`${BASE_URL}/api/bizdevsources`, {
      tenant_id: TENANT_ID,
      source_name: 'Bulk Assign Test Source',
      company_name: 'Bulk Assign Test Corp',
      is_test_data: true,
    });
    if (res.status === 200 || res.status === 201) {
      const json = await res.json();
      testBizDevId = json.data?.id;
      if (testBizDevId) createdBizDevIds.push(testBizDevId);
    }
  });

  test('assigns bizdev sources to an employee', async () => {
    if (!testBizDevId) return;
    const empId = await getTestEmployeeId();
    if (!empId) return;

    const res = await authPost(`${BASE_URL}/api/bizdevsources/bulk-assign`, {
      ids: [testBizDevId],
      assigned_to: empId,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });

  test('unassigns bizdev sources', async () => {
    if (!testBizDevId) return;

    const res = await authPost(`${BASE_URL}/api/bizdevsources/bulk-assign`, {
      ids: [testBizDevId],
      assigned_to: null,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });

  test('returns 400 for invalid UUIDs', async () => {
    const res = await authPost(`${BASE_URL}/api/bizdevsources/bulk-assign`, {
      ids: ['bad-id'],
      assigned_to: null,
      tenant_id: TENANT_ID,
    });
    assert.equal(res.status, 400);
  });
});

// ─── Override team tests ────────────────────────────────────────

describe('POST /api/v2/leads/bulk-assign with override_team', { skip: !SHOULD_RUN }, () => {
  test('passes override_team flag to backend', async () => {
    const empId = await getTestEmployeeId();
    if (!empId) return;

    const lead = await createLead({ first_name: 'OverrideTeam', last_name: 'Test' });
    assert.ok(lead.id);

    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [lead.id],
      assigned_to: empId,
      tenant_id: TENANT_ID,
      override_team: true,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });

  test('override_team with null assigned_to clears team', async () => {
    const lead = await createLead({ first_name: 'ClearTeam', last_name: 'Test' });
    assert.ok(lead.id);

    const res = await authPost(`${BASE_URL}/api/v2/leads/bulk-assign`, {
      ids: [lead.id],
      assigned_to: null,
      tenant_id: TENANT_ID,
      override_team: true,
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.data.updated, 1);
  });
});

// ─── Shared bulkAssign lib unit tests ───────────────────────────────

describe('bulkAssign validation (unit)', () => {
  // These test the shared lib without hitting the database
  let bulkAssignFn;

  before(async () => {
    try {
      const mod = await import('../../lib/bulkAssign.js');
      bulkAssignFn = mod.bulkAssign;
    } catch {
      // May fail if Supabase not initialized — tests will be skipped
    }
  });

  test('rejects when tenant_id missing', async () => {
    if (!bulkAssignFn) return;
    const result = await bulkAssignFn({
      table: 'leads',
      entityLabel: 'Lead',
      ids: ['a'],
      tenant_id: null,
      user: null,
    });
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('tenant_id'));
  });

  test('rejects when ids is empty', async () => {
    if (!bulkAssignFn) return;
    const result = await bulkAssignFn({
      table: 'leads',
      entityLabel: 'Lead',
      ids: [],
      tenant_id: TENANT_ID,
      user: null,
    });
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('non-empty'));
  });

  test('rejects when ids exceed max', async () => {
    if (!bulkAssignFn) return;
    const bigArray = Array.from(
      { length: 501 },
      (_, i) => `00000000-0000-0000-0000-${String(i).padStart(12, '0')}`,
    );
    const result = await bulkAssignFn({
      table: 'leads',
      entityLabel: 'Lead',
      ids: bigArray,
      tenant_id: TENANT_ID,
      user: null,
    });
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('500'));
  });

  test('rejects invalid UUID in ids', async () => {
    if (!bulkAssignFn) return;
    const result = await bulkAssignFn({
      table: 'leads',
      entityLabel: 'Lead',
      ids: ['not-uuid'],
      tenant_id: TENANT_ID,
      user: null,
    });
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('Invalid UUID'));
  });

  test('rejects invalid assigned_to', async () => {
    if (!bulkAssignFn) return;
    const result = await bulkAssignFn({
      table: 'leads',
      entityLabel: 'Lead',
      ids: ['00000000-0000-0000-0000-000000000001'],
      assigned_to: 'bad',
      tenant_id: TENANT_ID,
      user: null,
    });
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes('assigned_to'));
  });
});
