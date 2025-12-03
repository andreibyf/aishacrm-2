/**
 * Regression test: Opportunity stage update persists (Supabase adapter path)
 */

import assert from 'assert';

const BASE_URL = process.env.TEST_BACKEND_URL || 'http://localhost:4001';
const TEST_TENANT = `regression-tenant-${Date.now()}`;

async function jsonFetch(path, options = {}) {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  let body = null;
  try { body = await res.json(); } catch { /* non-json */ }
  return { res, body };
}

async function createOpportunity(initialStage = 'qualification') {
  const { res, body } = await jsonFetch('/api/opportunities', {
    method: 'POST',
    body: JSON.stringify({
      tenant_id: TEST_TENANT,
      name: 'Stage Regression Deal',
      amount: 5000,
      stage: initialStage,
    }),
  });
  assert.strictEqual(res.status, 201, `Expected 201 creating opp, got ${res.status}`);
  const opp = body?.data;
  assert(opp?.id, 'Created opportunity missing id');
  return opp;
}

async function updateStage(id, newStage) {
  const { res, body } = await jsonFetch(`/api/opportunities/${id}?tenant_id=${TEST_TENANT}`, {
    method: 'PUT',
    body: JSON.stringify({
      tenant_id: TEST_TENANT,
      stage: newStage,
    }),
  });
  assert.strictEqual(res.status, 200, `Expected 200 updating stage, got ${res.status} body=${JSON.stringify(body)}`);
  return body?.data;
}

async function getOpportunity(id) {
  const { res, body } = await jsonFetch(`/api/opportunities/${id}?tenant_id=${TEST_TENANT}`);
  assert.strictEqual(res.status, 200, `Expected 200 fetching opp, got ${res.status}`);
  return body?.data;
}

(async () => {
  console.log('▶ Opportunity Stage Update Regression Test');
  const created = await createOpportunity('prospecting');
  assert.strictEqual(created.stage, 'prospecting', 'Initial stage mismatch');

  const updated1 = await updateStage(created.id, 'qualification');
  assert.strictEqual(updated1.stage, 'qualification', 'Stage after first update mismatch');

  const fetched1 = await getOpportunity(created.id);
  assert.strictEqual(fetched1.stage, 'qualification', 'Stage not persisted after first update');

  const updated2 = await updateStage(created.id, 'proposal');
  assert.strictEqual(updated2.stage, 'proposal', 'Stage after second update mismatch');

  const fetched2 = await getOpportunity(created.id);
  assert.strictEqual(fetched2.stage, 'proposal', 'Stage not persisted after second update');

  console.log('✅ Stage updates persisted correctly across multiple transitions');
  process.exit(0);
})().catch(err => {
  console.error('❌ Regression test failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
