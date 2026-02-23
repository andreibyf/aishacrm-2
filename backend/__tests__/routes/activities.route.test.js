import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

// V1 /api/activities is RETIRED - use V2 routes
const API_BASE = `${BASE_URL}/api/v2/activities`;

const createdIds = [];

async function createActivity(payload) {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tenant_id: TENANT_ID,
      type: 'task',
      subject: 'UT',
      description: 'node test',
      ...payload,
    }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteActivity(id) {
  const res = await fetch(`${API_BASE}/${id}?tenant_id=${TENANT_ID}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;

  // Create test activities using TestFactory
  const activityA = TestFactory.activity({
    subject: 'UT Activity A',
    type: 'task',
    description: 'node test',
    tenant_id: TENANT_ID,
  });

  const a = await createActivity(activityA);
  assert.ok([200, 201].includes(a.status), `create activity A failed: ${JSON.stringify(a.json)}`);
  createdIds.push(a.json?.data?.id || a.json?.data?.activity?.id || a.json?.data?.id);

  const activityB = TestFactory.activity({
    subject: 'UT Activity B',
    type: 'task',
    description: 'node test',
    tenant_id: TENANT_ID,
  });

  const b = await createActivity(activityB);
  assert.ok([200, 201].includes(b.status), `create activity B failed: ${JSON.stringify(b.json)}`);
  createdIds.push(b.json?.data?.id || b.json?.data?.activity?.id || b.json?.data?.id);
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try {
      await deleteActivity(id);
    } catch {
      /* ignore */
    }
  }
});

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/activities returns 200 with tenant_id and includes total',
  async () => {
    const res = await fetch(`${API_BASE}?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200, 'expected 200 from activities list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(Number.isInteger(json.data?.total), 'expected total in response');
    assert.ok(Array.isArray(json.data?.activities), 'expected activities array');
  },
);

// V2 uses query params for filtering (search, status, type) on main endpoint - no separate /search
(SHOULD_RUN ? test : test.skip)('GET /api/v2/activities supports search query param', async () => {
  const res = await fetch(`${API_BASE}?tenant_id=${TENANT_ID}&search=UT`, {
    headers: getAuthHeaders(),
  });
  assert.equal(res.status, 200, 'expected 200 from activities with search');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.data?.activities), 'expected activities array');
});

(SHOULD_RUN ? test : test.skip)('GET /api/v2/activities supports status filter', async () => {
  const res = await fetch(`${API_BASE}?tenant_id=${TENANT_ID}&status=pending`, {
    headers: getAuthHeaders(),
  });
  assert.equal(res.status, 200, 'expected 200 from activities with status filter');
  const json = await res.json();
  assert.equal(json.status, 'success');
});

(SHOULD_RUN ? test : test.skip)('GET /api/v2/activities requires tenant_id', async () => {
  const res = await fetch(`${API_BASE}`, {
    headers: getAuthHeaders(),
  });
  assert.equal(res.status, 400, 'expected 400 when tenant_id is missing');
  const json = await res.json();
  assert.equal(json.status, 'error');
});
