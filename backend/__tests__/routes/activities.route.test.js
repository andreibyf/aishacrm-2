import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];

async function createActivity(payload) {
  const res = await fetch(`${BASE_URL}/api/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, type: 'task', subject: 'UT', description: 'node test', ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteActivity(id) {
  const res = await fetch(`${BASE_URL}/api/activities/${id}`, { method: 'DELETE' });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;
  const a = await createActivity({});
  assert.equal(a.status, 201, `create activity A failed: ${JSON.stringify(a.json)}`);
  createdIds.push(a.json?.data?.id || a.json?.data?.activity?.id || a.json?.data?.id);

  const b = await createActivity({});
  assert.equal(b.status, 201, `create activity B failed: ${JSON.stringify(b.json)}`);
  createdIds.push(b.json?.data?.id || b.json?.data?.activity?.id || b.json?.data?.id);
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try { await deleteActivity(id); } catch { /* ignore */ }
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/activities returns 200 with tenant_id and includes total', async () => {
  const res = await fetch(`${BASE_URL}/api/activities?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200, 'expected 200 from activities list');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Number.isInteger(json.data?.total), 'expected total in response');
  assert.ok(Array.isArray(json.data?.activities), 'expected activities array');
});
