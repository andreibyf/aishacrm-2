import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];

async function createLead(payload) {
  const res = await fetch(`${BASE_URL}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteLead(id) {
  const res = await fetch(`${BASE_URL}/api/leads/${id}`, { method: 'DELETE' });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;
  // Seed two leads with different statuses
  const a = await createLead({ first_name: 'Unit', last_name: 'TestA', email: `a_${Date.now()}@test.com`, company: 'UT', status: 'new' });
  assert.equal(a.status, 201, `create lead A failed: ${JSON.stringify(a.json)}`);
  createdIds.push(a.json?.data?.id || a.json?.data?.lead?.id || a.json?.data?.id);

  const b = await createLead({ first_name: 'Unit', last_name: 'TestB', email: `b_${Date.now()}@test.com`, company: 'UT', status: 'lost' });
  assert.equal(b.status, 201, `create lead B failed: ${JSON.stringify(b.json)}`);
  createdIds.push(b.json?.data?.id || b.json?.data?.lead?.id || b.json?.data?.id);
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try { await deleteLead(id); } catch { /* ignore */ }
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/leads returns 200 with tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/leads?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200, 'expected 200 from leads list');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.leads || Array.isArray(json.data), 'expected leads array in response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/leads supports status $nin (NOT IN)', async () => {
  const nin = encodeURIComponent(JSON.stringify({ $nin: ['lost', 'converted'] }));
  const res = await fetch(`${BASE_URL}/api/leads?tenant_id=${TENANT_ID}&status=${nin}`);
  assert.equal(res.status, 200, 'expected 200 from leads list with $nin');
  const json = await res.json();
  const leads = json.data?.leads || [];
  assert.ok(Array.isArray(leads), 'leads should be an array');
  // ensure no record has forbidden status
  for (const l of leads) {
    assert.notEqual((l.status || '').toLowerCase(), 'lost');
    assert.notEqual((l.status || '').toLowerCase(), 'converted');
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/leads/search returns matching leads', async () => {
  const res = await fetch(`${BASE_URL}/api/leads/search?tenant_id=${TENANT_ID}&q=Unit`);
  assert.equal(res.status, 200, 'expected 200 from leads search');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.leads || Array.isArray(json.data), 'expected leads array in search response');
  assert.ok(Number.isInteger(json.data?.total), 'expected total count in search response');
});

(SHOULD_RUN ? test : test.skip)('GET /api/leads/search requires q parameter', async () => {
  const res = await fetch(`${BASE_URL}/api/leads/search?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 400, 'expected 400 when q is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});

(SHOULD_RUN ? test : test.skip)('GET /api/leads/search requires tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/leads/search?q=test`);
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});
