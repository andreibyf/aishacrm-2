import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];

async function createOpportunity(payload) {
  const res = await fetch(`${BASE_URL}/api/opportunities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function getOpportunity(id) {
  const res = await fetch(`${BASE_URL}/api/opportunities/${id}?tenant_id=${TENANT_ID}`);
  const json = await res.json();
  return { status: res.status, json };
}

async function updateOpportunity(id, payload) {
  const res = await fetch(`${BASE_URL}/api/opportunities/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteOpportunity(id) {
  const res = await fetch(`${BASE_URL}/api/opportunities/${id}?tenant_id=${TENANT_ID}`, { method: 'DELETE' });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;
  // Seed test opportunities
  const a = await createOpportunity({ 
    name: 'Unit Test Opp A', 
    stage: 'prospecting',
    amount: 25000,
    close_date: '2025-12-31',
    probability: 25
  });
  assert.ok([200, 201].includes(a.status), `create opportunity A failed: ${JSON.stringify(a.json)}`);
  const idA = a.json?.data?.id || a.json?.data?.opportunity?.id;
  assert.ok(idA, 'opportunity A should have an id');
  createdIds.push(idA);

  const b = await createOpportunity({ 
    name: 'Unit Test Opp B', 
    stage: 'proposal',
    amount: 50000,
    close_date: '2025-11-30',
    probability: 75
  });
  assert.ok([200, 201].includes(b.status), `create opportunity B failed: ${JSON.stringify(b.json)}`);
  const idB = b.json?.data?.id || b.json?.data?.opportunity?.id;
  assert.ok(idB, 'opportunity B should have an id');
  createdIds.push(idB);
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try { await deleteOpportunity(id); } catch { /* ignore */ }
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/opportunities returns 200 with tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/opportunities?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200, 'expected 200 from opportunities list');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.opportunities || Array.isArray(json.data), 'expected opportunities array in response');
  assert.ok(Number.isInteger(json.data?.total), 'expected total count in response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/opportunities/:id returns specific opportunity', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid opportunity id');
  
  const result = await getOpportunity(id);
  assert.equal(result.status, 200, 'expected 200 from get opportunity by id');
  assert.equal(result.json.status, 'success');
  
  const opp = result.json.data?.opportunity || result.json.data;
  assert.ok(opp, 'expected opportunity in response');
  assert.equal(opp.name, 'Unit Test Opp A');
  assert.equal(opp.stage, 'prospecting');
  assert.equal(opp.amount, 25000);
});

(SHOULD_RUN ? test : test.skip)('GET /api/opportunities/:id enforces tenant scoping', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid opportunity id');
  
  // Try to access with wrong tenant_id (non-existent tenant)
  const res = await fetch(`${BASE_URL}/api/opportunities/${id}?tenant_id=wrong-tenant-999`);
  // Should return 403/404 for cross-tenant access, or 500 if tenant validation fails
  assert.ok([403, 404, 500].includes(res.status), `expected 403/404/500 for invalid tenant access, got ${res.status}`);
});

(SHOULD_RUN ? test : test.skip)('PUT /api/opportunities/:id updates opportunity', async () => {
  const id = createdIds[0];
  assert.ok(id, 'need a valid opportunity id');
  
  const result = await updateOpportunity(id, { 
    stage: 'negotiation',
    amount: 30000,
    probability: 50
  });
  
  assert.equal(result.status, 200, 'expected 200 from update opportunity');
  assert.equal(result.json.status, 'success');
  
  const updated = result.json.data?.opportunity || result.json.data;
  assert.ok(updated, 'expected updated opportunity in response');
  assert.equal(updated.stage, 'negotiation', 'stage should be updated');
  assert.equal(updated.amount, 30000, 'amount should be updated');
  assert.equal(updated.probability, 50, 'probability should be updated');
});

(SHOULD_RUN ? test : test.skip)('DELETE /api/opportunities/:id removes opportunity', async () => {
  // Create a temporary opportunity to delete
  const temp = await createOpportunity({ 
    name: 'Temp Delete Opp', 
    stage: 'prospecting',
    amount: 1000
  });
  assert.equal(temp.status, 201, 'create temp opportunity failed');
  const tempId = temp.json?.data?.id || temp.json?.data?.opportunity?.id;
  assert.ok(tempId, 'temp opportunity should have an id');
  
  // Delete it
  const status = await deleteOpportunity(tempId);
  assert.ok([200, 204].includes(status), `expected 200/204 from delete, got ${status}`);
  
  // Verify it's gone
  const verify = await getOpportunity(tempId);
  assert.equal(verify.status, 404, 'deleted opportunity should return 404');
});

(SHOULD_RUN ? test : test.skip)('POST /api/opportunities requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/opportunities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'No Tenant Opp', stage: 'prospecting', amount: 5000 })
  });
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});

(SHOULD_RUN ? test : test.skip)('POST /api/opportunities validates amount as number', async () => {
  const result = await createOpportunity({ 
    name: 'Opp with Amount', 
    stage: 'proposal',
    amount: 75000,
    probability: 60
  });
  
  assert.equal(result.status, 201, 'expected 201 from create opportunity');
  const opp = result.json?.data?.opportunity || result.json?.data;
  assert.ok(opp, 'expected opportunity in response');
  assert.equal(typeof opp.amount, 'number', 'amount should be a number');
  assert.equal(opp.amount, 75000);
  
  // Cleanup
  const id = result.json?.data?.id || result.json?.data?.opportunity?.id;
  if (id) {
    try { await deleteOpportunity(id); } catch { /* ignore */ }
  }
});

(SHOULD_RUN ? test : test.skip)('PUT /api/opportunities can advance stage', async () => {
  const id = createdIds[1];
  assert.ok(id, 'need a valid opportunity id');
  
  // Advance from 'proposal' to 'won'
  const result = await updateOpportunity(id, { 
    stage: 'won',
    probability: 100
  });
  
  assert.equal(result.status, 200, 'expected 200 from update');
  const updated = result.json.data?.opportunity || result.json.data;
  assert.equal(updated.stage, 'won', 'stage should advance to won');
  assert.equal(updated.probability, 100, 'won deals should have 100% probability');
});

(SHOULD_RUN ? test : test.skip)('GET /api/opportunities/search returns matching opportunities', async () => {
  const res = await fetch(`${BASE_URL}/api/opportunities/search?tenant_id=${TENANT_ID}&q=Unit`);
  assert.equal(res.status, 200, 'expected 200 from opportunities search');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.opportunities || Array.isArray(json.data), 'expected opportunities array in search response');
  assert.ok(Number.isInteger(json.data?.total), 'expected total count in search response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/opportunities/search requires q parameter', async () => {
  const res = await fetch(`${BASE_URL}/api/opportunities/search?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 400, 'expected 400 when q is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});

(SHOULD_RUN ? test : test.skip)('GET /api/opportunities/search requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/opportunities/search?q=test`);
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});
