import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

const createdIds = [];

async function createLead(payload) {
  const res = await fetch(`${BASE_URL}/api/leads`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteLead(id) {
  try {
    await fetch(`${BASE_URL}/api/leads/${id}`, { method: 'DELETE', headers: getAuthHeaders() });
  } catch {
    // ignore cleanup errors
    void 0;
  }
}

let skipDueToDbTimeout = false;

before(async () => {
  if (!SHOULD_RUN) return;

  // Ensure at least 3 leads for pagination checks using TestFactory
  // Lead creation can hit transient Supabase statement timeouts, so retry once
  for (let i = 0; i < 3; i++) {
    const leadData = TestFactory.lead({
      first_name: 'Pag',
      last_name: `Lead_${i + 1}`,
      company: 'UT',
      status: 'new',
      tenant_id: TENANT_ID,
    });

    let r = await createLead(leadData);
    if (r.status === 500) {
      // Retry once after brief pause (transient DB timeout)
      await new Promise((ok) => setTimeout(ok, 1000));
      r = await createLead(leadData);
    }
    if (r.status === 500 && r.json?.message?.includes('statement timeout')) {
      console.log('⚠️  Skipping leads pagination — DB statement timeout on lead creation');
      skipDueToDbTimeout = true;
      return;
    }
    assert.ok([200, 201].includes(r.status), `create lead failed: ${JSON.stringify(r.json)}`);
    const id = r.json?.data?.id || r.json?.data?.lead?.id || r.json?.data?.id;
    if (id) createdIds.push(id);
  }
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds) await deleteLead(id);
});

(SHOULD_RUN ? test : test.skip)(
  'Leads pagination: limit & offset yield distinct pages',
  { skip: false },
  async (t) => {
    if (skipDueToDbTimeout) {
      t.skip('DB statement timeout — leads table trigger is slow');
      return;
    }
    const page1 = await fetch(`${BASE_URL}/api/leads?tenant_id=${TENANT_ID}&limit=1&offset=0`, {
      headers: getAuthHeaders(),
    });
    assert.equal(page1.status, 200);
    const j1 = await page1.json();
    const a1 = j1.data?.leads || [];
    assert.equal(a1.length, 1);

    const page2 = await fetch(`${BASE_URL}/api/leads?tenant_id=${TENANT_ID}&limit=1&offset=1`, {
      headers: getAuthHeaders(),
    });
    assert.equal(page2.status, 200);
    const j2 = await page2.json();
    const a2 = j2.data?.leads || [];
    assert.equal(a2.length, 1);

    // With ORDER BY created_at DESC, items may differ; ensure not the same id when >=2 rows exist
    if (j1.data?.total >= 2) {
      assert.notEqual(a1[0]?.id, a2[0]?.id);
    }
  },
);
