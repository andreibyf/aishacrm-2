import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];

async function createContact(payload) {
  const res = await fetch(`${BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function getContact(id) {
  const res = await fetch(`${BASE_URL}/api/contacts/${id}?tenant_id=${TENANT_ID}`, {
    headers: getAuthHeaders()
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function updateContact(id, payload) {
  const res = await fetch(`${BASE_URL}/api/contacts/${id}`, {
    method: 'PUT',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteContact(id) {
  const res = await fetch(`${BASE_URL}/api/contacts/${id}?tenant_id=${TENANT_ID}`, {
    method: 'DELETE',
    headers: getAuthHeaders()
  });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;
  // Seed test contacts
  const a = await createContact({ 
    first_name: 'Unit', 
    last_name: 'TestContactA', 
    email: `contact_a_${Date.now()}@test.com`,
    phone: '555-0001',
    status: 'active'
  });
  assert.ok([200, 201].includes(a.status), `create contact A failed: ${JSON.stringify(a.json)}`);
  const idA = a.json?.data?.id || a.json?.data?.contact?.id;
  assert.ok(idA, 'contact A should have an id');
  createdIds.push(idA);

  const b = await createContact({ 
    first_name: 'Unit', 
    last_name: 'TestContactB', 
    email: `contact_b_${Date.now()}@test.com`,
    status: 'inactive'
  });
  assert.ok([200, 201].includes(b.status), `create contact B failed: ${JSON.stringify(b.json)}`);
  const idB = b.json?.data?.id || b.json?.data?.contact?.id;
  assert.ok(idB, 'contact B should have an id');
  createdIds.push(idB);
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try { await deleteContact(id); } catch { /* ignore */ }
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts returns 200 with tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/contacts?tenant_id=${TENANT_ID}`, {
    headers: getAuthHeaders()
  });
  assert.equal(res.status, 200, 'expected 200 from contacts list');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.contacts || Array.isArray(json.data), 'expected contacts array in response');
  assert.ok(Number.isInteger(json.data?.total), 'expected total count in response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts/:id returns specific contact', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid contact id');
  
  const result = await getContact(id);
  assert.equal(result.status, 200, 'expected 200 from get contact by id');
  assert.equal(result.json.status, 'success');
  
  const contact = result.json.data?.contact || result.json.data;
  assert.ok(contact, 'expected contact in response');
  assert.equal(contact.last_name, 'TestContactA');
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts/:id enforces tenant scoping', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid contact id');
  
  // Try to access with wrong tenant_id (non-existent tenant)
  const res = await fetch(`${BASE_URL}/api/contacts/${id}?tenant_id=wrong-tenant-999`, {
    headers: getAuthHeaders()
  });
  // Should return 403/404 for cross-tenant access, or 500 if tenant validation fails
  assert.ok([403, 404, 500].includes(res.status), `expected 403/404/500 for invalid tenant access, got ${res.status}`);
});

(SHOULD_RUN ? test : test.skip)('PUT /api/contacts/:id updates contact', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid contact id');
  
  const result = await updateContact(id, { 
    phone: '555-9999',
    status: 'lead'
  });
  
  assert.equal(result.status, 200, 'expected 200 from update contact');
  assert.equal(result.json.status, 'success');
  
  const updated = result.json.data?.contact || result.json.data;
  assert.ok(updated, 'expected updated contact in response');
  assert.equal(updated.phone, '555-9999', 'phone should be updated');
  assert.equal(updated.status, 'lead', 'status should be updated');
});

(SHOULD_RUN ? test : test.skip)('DELETE /api/contacts/:id removes contact', async () => {
  // Create a temporary contact to delete
  const temp = await createContact({ 
    first_name: 'Temp', 
    last_name: 'DeleteMe', 
    email: `temp_delete_${Date.now()}@test.com`
  });
  assert.equal(temp.status, 201, 'create temp contact failed');
  const tempId = temp.json?.data?.id || temp.json?.data?.contact?.id;
  assert.ok(tempId, 'temp contact should have an id');
  
  // Delete it
  const status = await deleteContact(tempId);
  assert.ok([200, 204].includes(status), `expected 200/204 from delete, got ${status}`);
  
  // Verify it's gone
  const verify = await getContact(tempId);
  assert.equal(verify.status, 404, 'deleted contact should return 404');
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts supports status filter', async () => {
  const res = await fetch(`${BASE_URL}/api/contacts?tenant_id=${TENANT_ID}&status=active`, {
    headers: getAuthHeaders()
  });
  assert.equal(res.status, 200, 'expected 200 from contacts list with status filter');
  const json = await res.json();
  const contacts = json.data?.contacts || [];
  assert.ok(Array.isArray(contacts), 'contacts should be an array');
  
  // Ensure all returned contacts have status 'active'
  for (const c of contacts) {
    assert.equal(c.status, 'active', 'filtered contacts should all be active');
  }
});

(SHOULD_RUN ? test : test.skip)('POST /api/contacts requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/contacts`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ first_name: 'No', last_name: 'Tenant', email: 'no@tenant.com' })
  });
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts/search returns matching contacts', async () => {
  const res = await fetch(`${BASE_URL}/api/contacts/search?tenant_id=${TENANT_ID}&q=Unit`, {
    headers: getAuthHeaders()
  });
  assert.equal(res.status, 200, 'expected 200 from contacts search');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.contacts || Array.isArray(json.data), 'expected contacts array in search response');
  assert.ok(Number.isInteger(json.data?.total), 'expected total count in search response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts/search requires q parameter', async () => {
  const res = await fetch(`${BASE_URL}/api/contacts/search?tenant_id=${TENANT_ID}`, {
    headers: getAuthHeaders()
  });
  assert.equal(res.status, 400, 'expected 400 when q is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});

(SHOULD_RUN ? test : test.skip)('GET /api/contacts/search requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/contacts/search?q=test`, {
    headers: getAuthHeaders()
  });
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});
