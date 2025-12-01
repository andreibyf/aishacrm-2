import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

const createdIds = [];

async function createLead(payload) {
  const res = await fetch(`${BASE_URL}/api/leads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, status: 'new', first_name: 'Pag', last_name: `Lead_${Date.now()}`, email: `pag_${Date.now()}@t.com`, company: 'UT', ...payload })
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteLead(id) {
  try {
    await fetch(`${BASE_URL}/api/leads/${id}`, { method: 'DELETE' });
  } catch {
    // ignore cleanup errors
    void 0;
  }
}

before(async () => {
  if (!SHOULD_RUN) return;
  // Ensure at least 3 leads for pagination checks
  for (let i = 0; i < 3; i++) {
    const r = await createLead({});
    assert.equal(r.status, 200, `create lead failed: ${JSON.stringify(r.json)}`);
    const id = r.json?.data?.id || r.json?.data?.lead?.id || r.json?.data?.id;
    if (id) createdIds.push(id);
  }
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds) await deleteLead(id);
});

(SHOULD_RUN ? test : test.skip)('Leads pagination: limit & offset yield distinct pages', async () => {
  const page1 = await fetch(`${BASE_URL}/api/leads?tenant_id=${TENANT_ID}&limit=1&offset=0`);
  assert.equal(page1.status, 200);
  const j1 = await page1.json();
  const a1 = j1.data?.leads || [];
  assert.equal(a1.length, 1);

  const page2 = await fetch(`${BASE_URL}/api/leads?tenant_id=${TENANT_ID}&limit=1&offset=1`);
  assert.equal(page2.status, 200);
  const j2 = await page2.json();
  const a2 = j2.data?.leads || [];
  assert.equal(a2.length, 1);

  // With ORDER BY created_at DESC, items may differ; ensure not the same id when >=2 rows exist
  if (j1.data?.total >= 2) {
    assert.notEqual(a1[0]?.id, a2[0]?.id);
  }
});
