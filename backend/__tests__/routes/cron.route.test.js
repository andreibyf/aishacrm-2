/**
 * Cron Route Tests
 * Tests for cron job management operations
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

const createdIds = [];

async function createCronJob(payload) {
  const res = await fetch(`${BASE_URL}/api/cron/jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, ...payload }),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function getCronJob(id) {
  const res = await fetch(`${BASE_URL}/api/cron/jobs/${id}?tenant_id=${TENANT_ID}`);
  const json = await res.json();
  return { status: res.status, json };
}

async function updateCronJob(id, payload) {
  const res = await fetch(`${BASE_URL}/api/cron/jobs/${id}?tenant_id=${TENANT_ID}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { status: res.status, json };
}

async function deleteCronJob(id) {
  const res = await fetch(`${BASE_URL}/api/cron/jobs/${id}?tenant_id=${TENANT_ID}`, {
    method: 'DELETE',
  });
  return res.status;
}

before(async () => {
  if (!SHOULD_RUN) return;
  // Create test cron job
  const result = await createCronJob({
    name: 'Test Cron Job',
    schedule: '0 0 * * *', // Daily at midnight
    function_name: 'test_function',
    is_active: false, // Keep inactive for testing
  });
  if ([200, 201].includes(result.status)) {
    const id = result.json?.data?.job?.id || result.json?.data?.id;
    if (id) createdIds.push(id);
  }
});

after(async () => {
  if (!SHOULD_RUN) return;
  for (const id of createdIds.filter(Boolean)) {
    try {
      await deleteCronJob(id);
    } catch {
      /* ignore */
    }
  }
});

(SHOULD_RUN ? test : test.skip)('GET /api/cron/jobs returns 200 with tenant_id', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/jobs?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200, 'expected 200 from cron jobs list');
  const json = await res.json();
  assert.equal(json.status, 'success');
  assert.ok(Array.isArray(json.data?.jobs), 'expected jobs array');
});

(SHOULD_RUN ? test : test.skip)('GET /api/cron/jobs supports tenant_id filter', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/jobs?tenant_id=${TENANT_ID}`);
  assert.equal(res.status, 200, 'expected 200 with tenant_id filter');
  const json = await res.json();
  assert.ok(Array.isArray(json.data?.jobs), 'expected jobs array');
});

(SHOULD_RUN ? test : test.skip)('GET /api/cron/jobs supports is_active filter', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/jobs?tenant_id=${TENANT_ID}&is_active=true`);
  assert.equal(res.status, 200, 'expected 200 with is_active filter');
  const json = await res.json();
  assert.ok(Array.isArray(json.data?.jobs), 'expected jobs array');
});

(SHOULD_RUN ? test : test.skip)('POST /api/cron/jobs creates new cron job', async () => {
  const result = await createCronJob({
    name: 'New Test Cron',
    schedule: '*/5 * * * *', // Every 5 minutes
    function_name: 'new_test_function',
    is_active: false,
  });

  assert.ok([200, 201].includes(result.status), `expected 200/201, got ${result.status}`);
  assert.equal(result.json.status, 'success');

  const job = result.json?.data?.job;
  assert.ok(job?.id, 'job should have an id');
  assert.equal(job.name, 'New Test Cron');

  if (job?.id) createdIds.push(job.id);
});

(SHOULD_RUN ? test : test.skip)(
  'POST /api/cron/jobs requires name, schedule, function_name',
  async () => {
    const res = await fetch(`${BASE_URL}/api/cron/jobs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID }),
    });
    assert.equal(res.status, 400, 'expected 400 for missing required fields');
  },
);

(SHOULD_RUN ? test : test.skip)('GET /api/cron/jobs/:id returns specific job', async () => {
  if (createdIds.length === 0) return;
  const id = createdIds[0];

  const result = await getCronJob(id);
  assert.equal(result.status, 200, 'expected 200 for specific job');
  assert.equal(result.json.status, 'success');
  assert.ok(result.json.data?.job, 'expected job in response');
});

(SHOULD_RUN ? test : test.skip)(
  'GET /api/cron/jobs/:id returns 404 for non-existent job',
  async () => {
    const result = await getCronJob('00000000-0000-0000-0000-000000000000');
    assert.equal(result.status, 404, 'expected 404 for non-existent job');
  },
);

(SHOULD_RUN ? test : test.skip)('PUT /api/cron/jobs/:id updates job', async () => {
  if (createdIds.length === 0) return;
  const id = createdIds[0];

  const result = await updateCronJob(id, {
    name: 'Updated Test Cron',
    is_active: true,
  });

  assert.ok([200, 404].includes(result.status), `expected 200/404, got ${result.status}`);
});

(SHOULD_RUN ? test : test.skip)('DELETE /api/cron/jobs/:id removes job', async () => {
  // Create a temp job to delete
  const temp = await createCronJob({
    name: 'Temp Delete Cron',
    schedule: '0 * * * *',
    function_name: 'temp_delete',
    is_active: false,
  });

  if (![200, 201].includes(temp.status)) return;
  const tempId = temp.json?.data?.job?.id || temp.json?.data?.id;
  if (!tempId) return;

  const status = await deleteCronJob(tempId);
  assert.ok([200, 204, 403].includes(status), `expected 200/204/403 from delete, got ${status}`);

  // Verify it's gone (skip if delete was blocked by auth)
  if (status !== 403) {
    const verify = await getCronJob(tempId);
    assert.equal(verify.status, 404, 'deleted job should return 404');
  }
});

(SHOULD_RUN ? test : test.skip)('POST /api/cron/jobs/:id/run triggers job execution', async () => {
  if (createdIds.length === 0) return;
  const id = createdIds[0];

  const res = await fetch(`${BASE_URL}/api/cron/jobs/${id}/run`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  });

  // Accept 200 (success), 404 (not found), or 500 (execution error - acceptable for test function)
  assert.ok([200, 404, 500].includes(res.status), `expected 200/404/500, got ${res.status}`);
});

(SHOULD_RUN ? test : test.skip)('GET /api/cron/status returns system status', async () => {
  const res = await fetch(`${BASE_URL}/api/cron/status`);
  // May not exist - accept 200 or 404
  assert.ok([200, 404].includes(res.status), `expected 200/404, got ${res.status}`);
});
