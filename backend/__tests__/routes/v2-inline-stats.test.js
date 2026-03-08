/**
 * V2 Inline Stats Tests
 *
 * Tests the inline stats feature across all v2 entity endpoints.
 * Stats are returned alongside paginated data in the GET list responses.
 *
 * Pattern (same for all entities):
 * 1. data.stats is always present in the list response.
 * 2. Stats reflect the same scope filters as the list: visibilityScope, assigned_to,
 *    assigned_to_team, filter (e.g. filter.$or for assigned_to, is_test_data), and
 *    entity-specific params (e.g. account_id). So stat cards update when the user
 *    filters by "Assigned to" or "Unassigned".
 * 3. Stats do NOT apply status/stage/type filters (so counts show all statuses/stages
 *    within the filtered scope). Stats do NOT apply search (stats = totals for scope).
 *
 * Entities and expected stats keys:
 * - Opportunities: total, prospecting, qualification, proposal, negotiation, closed_won, closed_lost
 * - Activities: total, scheduled, in_progress, overdue, completed, cancelled
 * - Contacts: total, active, inactive, prospect, customer, churned
 * - Accounts: total, customer, prospect, partner, vendor, competitor
 * - Leads: total, new, contacted, qualified, unqualified, converted, lost
 */

import { test, describe, after } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';
import { TENANT_ID } from '../testConstants.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

const cleanupIds = {
  opportunities: [],
  activities: [],
  contacts: [],
  accounts: [],
  leads: [],
};

// Helper to delete entity
async function deleteEntity(entityType, id) {
  try {
    await fetch(`${BASE_URL}/api/v2/${entityType}/${id}?tenant_id=${TENANT_ID}`, {
      method: 'DELETE',
      headers: getAuthHeaders(),
    });
  } catch {
    // Ignore cleanup errors
  }
}

// ============================================
// OPPORTUNITIES INLINE STATS
// ============================================

describe('Opportunities V2 Inline Stats', { skip: !SHOULD_RUN }, () => {
  test('GET /api/v2/opportunities returns stats object', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(json.data?.stats, 'Response should contain stats object');

    const { stats } = json.data;
    assert.ok(typeof stats.total === 'number', 'stats.total should be a number');
    assert.ok(typeof stats.prospecting === 'number', 'stats.prospecting should be a number');
    assert.ok(typeof stats.qualification === 'number', 'stats.qualification should be a number');
    assert.ok(typeof stats.proposal === 'number', 'stats.proposal should be a number');
    assert.ok(typeof stats.negotiation === 'number', 'stats.negotiation should be a number');
    assert.ok(typeof stats.closed_won === 'number', 'stats.closed_won should be a number');
    assert.ok(typeof stats.closed_lost === 'number', 'stats.closed_lost should be a number');
  });

  test('Opportunities stats sum equals total', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();
    const { stats } = json.data;

    const sum =
      stats.prospecting +
      stats.qualification +
      stats.proposal +
      stats.negotiation +
      stats.closed_won +
      stats.closed_lost;

    // Sum of stages should equal total (all opportunities have a stage)
    assert.equal(sum, stats.total, 'Sum of stages should equal total');
  });

  test('Opportunities stats respect filter scope', async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&is_test_data=true`,
      { headers: getAuthHeaders() },
    );
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present even with filters');
    assert.ok(json.data.stats.total >= 0, 'Filtered stats total should be >= 0');
  });

  test('Opportunities stats ignore stage filter', async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/opportunities?tenant_id=${TENANT_ID}&stage=prospecting`,
      { headers: getAuthHeaders() },
    );
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present');
    const { stats } = json.data;
    const stageSum =
      stats.prospecting +
      stats.qualification +
      stats.proposal +
      stats.negotiation +
      stats.closed_won +
      stats.closed_lost;
    assert.equal(stageSum, stats.total, 'Stats should count all stages regardless of stage filter');
  });
});

// ============================================
// ACTIVITIES INLINE STATS
// ============================================

describe('Activities V2 Inline Stats', { skip: !SHOULD_RUN }, () => {
  test('GET /api/v2/activities returns stats object', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(json.data?.stats, 'Response should contain stats object');

    const { stats } = json.data;
    assert.ok(typeof stats.total === 'number', 'stats.total should be a number');
    assert.ok(typeof stats.scheduled === 'number', 'stats.scheduled should be a number');
    assert.ok(typeof stats.in_progress === 'number', 'stats.in_progress should be a number');
    assert.ok(typeof stats.overdue === 'number', 'stats.overdue should be a number');
    assert.ok(typeof stats.completed === 'number', 'stats.completed should be a number');
    assert.ok(typeof stats.cancelled === 'number', 'stats.cancelled should be a number');
  });

  test('Activities stats respect filter scope', async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&is_test_data=true`,
      { headers: getAuthHeaders() },
    );
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present even with filters');
    assert.ok(typeof json.data.stats.total === 'number', 'Filtered stats should have total');
  });

  test('Activities stats ignore status filter (count all statuses in scope)', async () => {
    const res = await fetch(
      `${BASE_URL}/api/v2/activities?tenant_id=${TENANT_ID}&status=scheduled`,
      { headers: getAuthHeaders() },
    );
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present');
    const { stats } = json.data;
    const statusSum =
      (stats.scheduled || 0) +
      (stats.in_progress || 0) +
      (stats.overdue || 0) +
      (stats.completed || 0) +
      (stats.cancelled || 0);
    assert.equal(statusSum, stats.total, 'Sum of status counts should equal total');
  });
});

// ============================================
// CONTACTS INLINE STATS
// ============================================

describe('Contacts V2 Inline Stats', { skip: !SHOULD_RUN }, () => {
  test('GET /api/v2/contacts returns stats object', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/contacts?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(json.data?.stats, 'Response should contain stats object');

    const { stats } = json.data;
    assert.ok(typeof stats.total === 'number', 'stats.total should be a number');
    assert.ok(typeof stats.active === 'number', 'stats.active should be a number');
    assert.ok(typeof stats.inactive === 'number', 'stats.inactive should be a number');
    assert.ok(typeof stats.prospect === 'number', 'stats.prospect should be a number');
    assert.ok(typeof stats.customer === 'number', 'stats.customer should be a number');
  });

  test('Contacts stats respect filter scope', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/contacts?tenant_id=${TENANT_ID}&status=active`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present');
    assert.ok(typeof json.data.stats.total === 'number', 'Filtered stats should have total');
  });
});

// ============================================
// ACCOUNTS INLINE STATS
// ============================================

describe('Accounts V2 Inline Stats', { skip: !SHOULD_RUN }, () => {
  test('GET /api/v2/accounts returns stats object', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(json.data?.stats, 'Response should contain stats object');

    const { stats } = json.data;
    assert.ok(typeof stats.total === 'number', 'stats.total should be a number');
    assert.ok(typeof stats.customer === 'number', 'stats.customer should be a number');
    assert.ok(typeof stats.prospect === 'number', 'stats.prospect should be a number');
    assert.ok(typeof stats.partner === 'number', 'stats.partner should be a number');
    assert.ok(typeof stats.vendor === 'number', 'stats.vendor should be a number');
    assert.ok(typeof stats.competitor === 'number', 'stats.competitor should be a number');
  });

  test('Accounts stats respect filter scope', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}&type=customer`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present');
    assert.ok(typeof json.data.stats.total === 'number', 'Filtered stats should have total');
  });

  test('Accounts stats ignore type filter (count all types in scope)', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/accounts?tenant_id=${TENANT_ID}&type=customer`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present');
    const { stats } = json.data;
    const typeSum =
      (stats.customer || 0) +
      (stats.prospect || 0) +
      (stats.partner || 0) +
      (stats.vendor || 0) +
      (stats.competitor || 0);
    assert.equal(typeSum, stats.total, 'Sum of type counts should equal total');
  });
});

// ============================================
// LEADS INLINE STATS
// ============================================

describe('Leads V2 Inline Stats', { skip: !SHOULD_RUN }, () => {
  test('GET /api/v2/leads returns stats object', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/leads?tenant_id=${TENANT_ID}`, {
      headers: getAuthHeaders(),
    });
    assert.equal(res.status, 200);
    const json = await res.json();

    assert.ok(json.data?.stats, 'Response should contain stats object');

    const { stats } = json.data;
    assert.ok(typeof stats.total === 'number', 'stats.total should be a number');
    assert.ok(typeof stats.new === 'number', 'stats.new should be a number');
    assert.ok(typeof stats.contacted === 'number', 'stats.contacted should be a number');
    assert.ok(typeof stats.qualified === 'number', 'stats.qualified should be a number');
    assert.ok(typeof stats.unqualified === 'number', 'stats.unqualified should be a number');
    assert.ok(typeof stats.converted === 'number', 'stats.converted should be a number');
    assert.ok(typeof stats.lost === 'number', 'stats.lost should be a number');
  });

  test('Leads stats respect filter scope (is_test_data)', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/leads?tenant_id=${TENANT_ID}&is_test_data=true`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present even with filters');
    assert.ok(typeof json.data.stats.total === 'number', 'Filtered stats should have total');
  });

  test('Leads stats ignore status filter', async () => {
    const res = await fetch(`${BASE_URL}/api/v2/leads?tenant_id=${TENANT_ID}&status=new`, {
      headers: getAuthHeaders(),
    });
    const json = await res.json();

    assert.ok(json.data?.stats, 'Stats should be present');
    const { stats } = json.data;
    const statusSum =
      stats.new +
      stats.contacted +
      stats.qualified +
      stats.unqualified +
      stats.converted +
      stats.lost;
    assert.equal(
      statusSum,
      stats.total,
      'Stats should count all statuses regardless of status filter',
    );
  });
});

// ============================================
// CLEANUP
// ============================================

after(async () => {
  if (!SHOULD_RUN) return;

  for (const [entityType, ids] of Object.entries(cleanupIds)) {
    for (const id of ids.filter(Boolean)) {
      await deleteEntity(entityType, id);
    }
  }
});
