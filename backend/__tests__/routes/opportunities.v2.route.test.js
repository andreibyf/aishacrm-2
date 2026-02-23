import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled (requires Supabase creds + running backend)
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

const createdIds = [];

async function createOpportunityV2(payload) {
  const res = await fetch(`${BASE_URL}/api/v2/opportunities`, {
    method: 'POST',
    headers: {
      ...getAuthHeaders(),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteOpportunityV2(id) {
  const res = await fetch(`${BASE_URL}/api/v2/opportunities/${id}?tenant_id=${TENANT_ID}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;

  // Create test opportunities with different timestamps using TestFactory
  const oppA = TestFactory.opportunity({
    name: 'V2 Test Opp A',
    stage: 'prospecting',
    amount: 10000,
    tenant_id: TENANT_ID,
  });

  const resultA = await createOpportunityV2(oppA);
  if ([200, 201].includes(resultA.status)) {
    const idA = resultA.json?.data?.opportunity?.id || resultA.json?.data?.id;
    if (idA) createdIds.push(idA);
  }

  // Small delay to ensure different timestamps
  await new Promise((resolve) => setTimeout(resolve, 100));

  const oppB = TestFactory.opportunity({
    name: 'V2 Test Opp B',
    stage: 'proposal',
    amount: 20000,
    tenant_id: TENANT_ID,
  });

  const resultB = await createOpportunityV2(oppB);
  if ([200, 201].includes(resultB.status)) {
    const idB = resultB.json?.data?.opportunity?.id || resultB.json?.data?.id;
    if (idB) createdIds.push(idB);
  }

  await new Promise((resolve) => setTimeout(resolve, 100));

  const oppC = TestFactory.opportunity({
    name: 'V2 Test Opp C',
    stage: 'negotiation',
    amount: 30000,
    tenant_id: TENANT_ID,
  });

  const resultC = await createOpportunityV2(oppC);
  if ([200, 201].includes(resultC.status)) {
    const idC = resultC.json?.data?.opportunity?.id || resultC.json?.data?.id;
    if (idC) createdIds.push(idC);
  }
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try {
      await deleteOpportunityV2(id);
    } catch {
      /* ignore */
    }
  }
});

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities returns 200 with tenant_id',
  async () => {
    const res = await fetch(`${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200, 'expected 200 from v2 opportunities list');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');
    assert.ok(Array.isArray(json.data.opportunities), 'opportunities should be an array');
    assert.ok(Number.isInteger(json.data?.total), 'expected total count in response');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities supports single sort field',
  async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=-updated_at`,
      {
        headers: getAuthHeaders(),
      },
    );
    assert.equal(res.status, 200, 'expected 200 from v2 opportunities list with single sort');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');
    assert.ok(Array.isArray(json.data.opportunities), 'opportunities should be an array');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities supports multi-field sort (descending)',
  async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=-updated_at,-id`,
      {
        headers: getAuthHeaders(),
      },
    );
    assert.equal(res.status, 200, 'expected 200 from v2 opportunities list with multi-field sort');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');
    assert.ok(Array.isArray(json.data.opportunities), 'opportunities should be an array');
    assert.ok(Number.isInteger(json.data?.total), 'expected total count in response');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities supports multi-field sort (ascending)',
  async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=amount,name`,
      {
        headers: getAuthHeaders(),
      },
    );
    assert.equal(
      res.status,
      200,
      'expected 200 from v2 opportunities list with ascending multi-field sort',
    );
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');
    assert.ok(Array.isArray(json.data.opportunities), 'opportunities should be an array');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities supports mixed sort directions',
  async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=-amount,name`,
      {
        headers: getAuthHeaders(),
      },
    );
    assert.equal(
      res.status,
      200,
      'expected 200 from v2 opportunities list with mixed sort directions',
    );
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');

    // Verify sort order if we have test data
    const opportunities = json.data.opportunities;
    if (opportunities.length > 1) {
      // Check that amounts are in descending order (or equal)
      for (let i = 1; i < opportunities.length; i++) {
        const prevAmount = opportunities[i - 1].amount || 0;
        const currAmount = opportunities[i].amount || 0;
        assert.ok(
          prevAmount >= currAmount,
          `Expected descending amount order: ${prevAmount} >= ${currAmount}`,
        );
      }
    }
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities handles invalid sort gracefully',
  async () => {
    // Test with invalid sort parameter - should not crash
    const res = await fetch(`${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=,,,`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200, 'expected 200 even with invalid sort (should use default)');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');
  },
);

(SHOULD_RUN ? test : test.skip)(
  'GET /api/v2/opportunities rejects invalid field names',
  async () => {
    // Test with SQL injection attempt - should ignore invalid fields
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=-malicious_field,invalid_column`,
      {
        headers: getAuthHeaders(),
      },
    );
    assert.equal(res.status, 200, 'expected 200 (invalid fields should be ignored)');
    const json = await res.json();
    assert.equal(json.status, 'success');
    assert.ok(json.data?.opportunities, 'expected opportunities array in response');
    // Should fall back to default sort since all fields are invalid
  },
);

(SHOULD_RUN ? test : test.skip)('GET /api/v2/opportunities with pagination and sort', async () => {
  const res = await fetch(
    `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&sort=-updated_at,-id&limit=10&offset=0`,
    {
      headers: getAuthHeaders(),
    },
  );
  assert.equal(res.status, 200, 'expected 200 from v2 opportunities with pagination and sort');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(json.data?.opportunities, 'expected opportunities array in response');
  assert.equal(json.data.limit, 10, 'expected limit to be 10');
  assert.equal(json.data.offset, 0, 'expected offset to be 0');
});
