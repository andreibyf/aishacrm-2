/**
 * booking-analytics.test.js
 * Tests for the /api/analytics/* endpoints.
 *
 * Uses Node.js native test runner (no Jest/Vitest).
 * All tests require a running backend + valid Supabase credentials.
 * Skipped in CI unless CI_BACKEND_TESTS=true.
 */

import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TestFactory } from '../helpers/test-entity-factory.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function analyticsGet(path, params = {}) {
  const qs = new URLSearchParams({ tenant_id: TENANT_ID, ...params }).toString();
  return fetch(`${BASE_URL}/api/analytics/${path}?${qs}`, {
    headers: getAuthHeaders(),
  });
}

async function createPackage(overrides = {}) {
  const payload = {
    tenant_id: TENANT_ID,
    name: `Analytics Test Pack ${Date.now()}`,
    session_count: 4,
    price_cents: 4000,
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

async function purchaseCredits({ contact_id, package_id }) {
  const res = await fetch(`${BASE_URL}/api/session-credits/purchase`, {
    method: 'POST',
    headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ tenant_id: TENANT_ID, contact_id, package_id }),
  });
  const json = await res.json();
  return { status: res.status, data: json.data };
}

// ---------------------------------------------------------------------------
// Suite: GET /api/analytics/bookings
// ---------------------------------------------------------------------------

describe('GET /api/analytics/bookings', { skip: !SHOULD_RUN }, () => {
  test('returns 200 with expected shape', async () => {
    const res = await analyticsGet('bookings');
    assert.equal(res.status, 200, `Expected 200, got ${res.status}`);
    const json = await res.json();
    assert.equal(json.status, 'success');

    const d = json.data;
    assert.ok(typeof d.total === 'number', 'total should be a number');
    assert.ok(typeof d.by_status === 'object', 'by_status should be an object');
    assert.ok(typeof d.completion_rate_pct === 'number', 'completion_rate_pct should be a number');
    assert.ok(typeof d.no_show_rate_pct === 'number', 'no_show_rate_pct should be a number');
    assert.ok(Array.isArray(d.daily_trend), 'daily_trend should be an array');
    assert.ok(json.meta?.from, 'meta.from should be set');
    assert.ok(json.meta?.to, 'meta.to should be set');
  });

  test('accepts from/to date range params', async () => {
    const from = '2025-01-01';
    const to = '2025-01-31';
    const res = await analyticsGet('bookings', { from, to });
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.meta.from.slice(0, 10), from);
    assert.equal(json.meta.to.slice(0, 10), to);
  });

  test('returns 400 when tenant_id is missing', async () => {
    // Call without any auth — validateTenantAccess should reject
    const res = await fetch(`${BASE_URL}/api/analytics/bookings`);
    assert.ok([400, 401, 403].includes(res.status), `Expected 40x, got ${res.status}`);
  });

  test('total matches sum of by_status values', async () => {
    const res = await analyticsGet('bookings');
    const { data } = await res.json();
    const sumOfStatuses = Object.values(data.by_status).reduce((a, b) => a + b, 0);
    assert.equal(data.total, sumOfStatuses, 'total must equal sum of by_status counts');
  });

  test('completion_rate_pct is 0 when total is 0', async () => {
    // Use a far-future date range that will have no bookings
    const res = await analyticsGet('bookings', { from: '2099-01-01', to: '2099-01-02' });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.total, 0);
    assert.equal(data.completion_rate_pct, 0);
    assert.equal(data.no_show_rate_pct, 0);
  });
});

// ---------------------------------------------------------------------------
// Suite: GET /api/analytics/packages
// ---------------------------------------------------------------------------

describe('GET /api/analytics/packages', { skip: !SHOULD_RUN }, () => {
  let packageId = null;
  let contactId = null;

  before(async () => {
    // Create a package and purchase credits so the endpoint has data
    const { data: pkg } = await createPackage({ name: 'Analytics Pkg Test', session_count: 2 });
    packageId = pkg?.id;

    const contactPayload = TestFactory.contact({
      first_name: 'Analytics',
      last_name: 'Buyer',
      tenant_id: TENANT_ID,
    });
    const res = await fetch(`${BASE_URL}/api/contacts`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(contactPayload),
    });
    const json = await res.json();
    contactId = json.data?.id || json.data?.contact?.id;

    if (packageId && contactId) {
      await purchaseCredits({ contact_id: contactId, package_id: packageId });
    }
  });

  test('returns 200 with expected shape', async () => {
    const res = await analyticsGet('packages');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');

    const d = json.data;
    assert.ok(typeof d.total_revenue_cents === 'number', 'total_revenue_cents should be a number');
    assert.ok(Array.isArray(d.packages), 'packages should be an array');
    assert.ok(d.credit_utilization, 'credit_utilization should be present');
    assert.ok(typeof d.credit_utilization.utilization_rate_pct === 'number');
    assert.ok(Array.isArray(d.popular_slots), 'popular_slots should be an array');
  });

  test('purchased package appears in packages list', async () => {
    if (!packageId) return;
    const res = await analyticsGet('packages');
    const { data } = await res.json();
    const found = data.packages.find((p) => p.package_id === packageId);
    assert.ok(found, 'Newly created package should appear in analytics');
    assert.ok(found.sold_count >= 1, 'sold_count should be at least 1');
  });

  test('total_revenue_cents is non-negative', async () => {
    const res = await analyticsGet('packages');
    const { data } = await res.json();
    assert.ok(data.total_revenue_cents >= 0);
  });

  after(async () => {
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

// ---------------------------------------------------------------------------
// Suite: GET /api/analytics/credits-utilization
// ---------------------------------------------------------------------------

describe('GET /api/analytics/credits-utilization', { skip: !SHOULD_RUN }, () => {
  let packageId = null;
  let contactId = null;

  before(async () => {
    const { data: pkg } = await createPackage({ name: 'Utilization Test Pack', session_count: 3 });
    packageId = pkg?.id;

    const contactPayload = TestFactory.contact({
      first_name: 'Util',
      last_name: 'Tester',
      tenant_id: TENANT_ID,
    });
    const res = await fetch(`${BASE_URL}/api/contacts`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(contactPayload),
    });
    const json = await res.json();
    contactId = json.data?.id || json.data?.contact?.id;

    if (packageId && contactId) {
      await purchaseCredits({ contact_id: contactId, package_id: packageId });
    }
  });

  test('returns 200 with expected shape', async () => {
    const res = await analyticsGet('credits-utilization');
    assert.equal(res.status, 200);
    const json = await res.json();
    assert.equal(json.status, 'success');

    const d = json.data;
    assert.ok(Array.isArray(d.balance_distribution), 'balance_distribution should be an array');
    assert.ok(Array.isArray(d.top_bookers), 'top_bookers should be an array');
    assert.ok(
      typeof d.active_credit_holders === 'number',
      'active_credit_holders should be a number',
    );
  });

  test('active_credit_holders is non-negative', async () => {
    const res = await analyticsGet('credits-utilization');
    const { data } = await res.json();
    assert.ok(data.active_credit_holders >= 0);
  });

  test('balance_distribution entries have range and count', async () => {
    const res = await analyticsGet('credits-utilization');
    const { data } = await res.json();
    for (const bucket of data.balance_distribution) {
      assert.ok(bucket.range, 'Each bucket should have a range');
      assert.ok(typeof bucket.count === 'number', 'Each bucket count should be a number');
    }
  });

  test('top_bookers have expected fields', async () => {
    const res = await analyticsGet('credits-utilization');
    const { data } = await res.json();
    for (const booker of data.top_bookers) {
      assert.ok(booker.id, 'Booker should have an id');
      assert.ok(typeof booker.total_credits === 'number', 'total_credits should be a number');
    }
  });

  after(async () => {
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
