/**
 * calcom-webhook.test.js
 * Tests for the Cal.com webhook handler and session credits logic.
 *
 * Uses Node.js native test runner (no Jest/Vitest).
 * TestFactory provides entity fixture helpers.
 *
 * Requires a running backend + Supabase credentials.
 * Skipped in CI unless CI_BACKEND_TESTS=true.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { getAuthHeaders } from '../helpers/auth.js';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeCalcomSignature(body, secret) {
  const rawBody = typeof body === 'string' ? body : JSON.stringify(body);
  const sig = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return `sha256=${sig}`;
}

async function postWebhook(payload, secret = 'test-webhook-secret') {
  const body = JSON.stringify(payload);
  const signature = makeCalcomSignature(body, secret);
  return fetch(`${BASE_URL}/api/webhooks/calcom`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Cal-Signature-256': signature,
    },
    body,
  });
}

async function createPackage(overrides = {}) {
  const payload = {
    tenant_id: TENANT_ID,
    name: `Test Package ${Date.now()}`,
    session_count: 5,
    price_cents: 5000,
    validity_days: 90,
    ...overrides,
  };
  const res = await fetch(`${BASE_URL}/api/session-packages`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const json = await res.json();
  return { status: res.status, data: json.data };
}

async function purchaseCredits({ contact_id, lead_id, package_id }) {
  const res = await fetch(`${BASE_URL}/api/session-credits/purchase`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, contact_id, lead_id, package_id }),
  });
  const json = await res.json();
  return { status: res.status, data: json.data };
}

async function getCredits({ contact_id, lead_id }) {
  const param = contact_id ? `contact_id=${contact_id}` : `lead_id=${lead_id}`;
  const res = await fetch(`${BASE_URL}/api/session-credits?tenant_id=${TENANT_ID}&${param}`, {
    headers: getAuthHeaders(),
  });
  const json = await res.json();
  return { status: res.status, data: json.data, summary: json.summary };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Session Packages API', { skip: !SHOULD_RUN }, () => {
  let createdPackageId = null;

  test('POST /api/session-packages — create package', async () => {
    const { status, data } = await createPackage({ name: 'Test 5-Pack', session_count: 5 });
    assert.ok([200, 201].includes(status), `Expected 201, got ${status}`);
    assert.ok(data?.id, 'Package should have an id');
    assert.equal(data.session_count, 5);
    createdPackageId = data.id;
  });

  test('GET /api/session-packages — returns package list', async () => {
    const res = await fetch(`${BASE_URL}/api/session-packages?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.ok(Array.isArray(json.data), 'data should be an array');
  });

  test('PUT /api/session-packages/:id — update package name', async () => {
    if (!createdPackageId) return;
    const res = await fetch(`${BASE_URL}/api/session-packages/${createdPackageId}`, {
      method: 'PUT',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, name: 'Updated Pack' }),
    });
    const json = await res.json();
    assert.equal(res.status, 200);
    assert.equal(json.data?.name, 'Updated Pack');
  });

  after(async () => {
    // Soft-delete test package
    if (createdPackageId) {
      await fetch(`${BASE_URL}/api/session-packages/${createdPackageId}?tenant_id=${TENANT_ID}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    }
  });
});

describe('Session Credits — Purchase and Balance', { skip: !SHOULD_RUN }, () => {
  let packageId = null;
  let contactId = null;
  let creditId = null;

  before(async () => {
    // Create a test package
    const { data } = await createPackage({ name: 'Credits Test Pack', session_count: 3 });
    packageId = data?.id;
    assert.ok(packageId, 'Package creation failed in before()');

    // Create a test contact
    const contactPayload = TestFactory.contact({
      first_name: 'Credits',
      last_name: 'TestUser',
      tenant_id: TENANT_ID,
    });
    const res = await fetch(`${BASE_URL}/api/contacts`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(contactPayload),
    });
    const json = await res.json();
    contactId = json.data?.id || json.data?.contact?.id;
    assert.ok(contactId, 'Contact creation failed in before()');
  });

  test('POST /api/session-credits/purchase — assigns credits to contact', async () => {
    const { status, data } = await purchaseCredits({
      contact_id: contactId,
      package_id: packageId,
    });
    assert.ok([200, 201].includes(status), `Expected 201, got ${status}`);
    assert.equal(data?.credits_remaining, 3, 'Should start with all 3 credits');
    assert.equal(data?.credits_purchased, 3);
    creditId = data?.id;
  });

  test('GET /api/session-credits — returns credit balance for contact', async () => {
    const { status, summary } = await getCredits({ contact_id: contactId });
    assert.equal(status, 200);
    assert.ok(summary?.total_remaining >= 3, 'Should have at least 3 credits remaining');
  });

  test('POST /api/session-credits/purchase — requires package_id', async () => {
    const res = await fetch(`${BASE_URL}/api/session-credits/purchase`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, contact_id: contactId }),
    });
    assert.equal(res.status, 400);
  });

  test('POST /api/session-credits/grant — admin manual grant', async () => {
    const res = await fetch(`${BASE_URL}/api/session-credits/grant`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        contact_id: contactId,
        package_id: packageId,
        credits_count: 2,
        note: 'Goodwill grant from test',
      }),
    });
    const json = await res.json();
    assert.ok([200, 201].includes(res.status), `Grant failed: ${JSON.stringify(json)}`);
    assert.equal(json.data?.credits_remaining, 2);
    assert.equal(json.data?.metadata?.granted_manually, true);
  });

  after(async () => {
    // Clean up contact
    if (contactId) {
      await fetch(`${BASE_URL}/api/contacts/${contactId}?tenant_id=${TENANT_ID}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
      });
    }
    if (packageId) {
      await fetch(`${BASE_URL}/api/session-packages/${packageId}`, {
        method: 'DELETE',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      });
    }
  });
});

describe('Cal.com Webhook — Signature Verification', { skip: !SHOULD_RUN }, () => {
  test('Rejects request with missing signature', async () => {
    const res = await fetch(`${BASE_URL}/api/webhooks/calcom`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: {} }),
    });
    // 401 expected — no signature / no matching tenant
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });

  test('Rejects request with invalid signature', async () => {
    const body = JSON.stringify({ triggerEvent: 'BOOKING_CREATED', payload: { uid: 'xyz' } });
    const res = await fetch(`${BASE_URL}/api/webhooks/calcom`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Cal-Signature-256': 'sha256=invalidsignature',
      },
      body,
    });
    assert.ok([401, 403].includes(res.status), `Expected 401/403, got ${res.status}`);
  });
});

describe('Cal.com Webhook — BOOKING_REQUESTED (no matching tenant)', { skip: !SHOULD_RUN }, () => {
  test('Returns 401 for unknown webhook secret', async () => {
    const payload = {
      triggerEvent: 'BOOKING_REQUESTED',
      payload: {
        uid: 'test-booking-001',
        startTime: new Date(Date.now() + 86400000).toISOString(),
        endTime: new Date(Date.now() + 90000000).toISOString(),
        attendees: [{ email: 'unknown@example.com' }],
      },
    };
    const res = await postWebhook(payload, 'wrong-secret-that-wont-match');
    assert.equal(res.status, 401);
  });
});
