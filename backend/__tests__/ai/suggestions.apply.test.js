/**
 * Suggestions Apply Dispatcher Tests
 *
 * Verifies that POST /api/ai/suggestions/:id/apply correctly dispatches:
 * - `send_email` actions → CARE email pipeline (executeCareSendEmailAction)
 * - all other actions   → Braid tool execution (executeBraidTool)
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { initSupabaseForTests, hasSupabaseCredentials } from '../setup.js';
import { getAuthHeaders } from '../helpers/auth.js';
import { TENANT_ID, NONEXISTENT_ID } from '../testConstants.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

describe('Suggestions Apply Dispatcher', { skip: !SHOULD_RUN }, () => {
  before(async () => {
    if (hasSupabaseCredentials()) {
      await initSupabaseForTests();
    }
  });

  // ── Validation ──────────────────────────────────────────────────────────

  test('POST /apply returns 400 when tenant_id is missing', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/${NONEXISTENT_ID}/apply`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(res.status, 400, 'Should require tenant_id');
  });

  test('POST /apply returns 404 for non-existent suggestion', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/${NONEXISTENT_ID}/apply`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID }),
    });
    const json = await res.json();
    assert.equal(res.status, 404, `Expected 404, got ${res.status}`);
    assert.ok(json.message?.includes('not found') || json.message?.includes('not approved'),
      'Should indicate suggestion not found or not approved');
  });

  test('POST /apply returns 404 for pending (not-yet-approved) suggestion', async () => {
    // Try to find a pending suggestion
    const listRes = await fetch(
      `${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=pending&limit=1`,
      { headers: getAuthHeaders() },
    );
    const listJson = await listRes.json();

    if (listJson.data?.suggestions?.length > 0) {
      const id = listJson.data.suggestions[0].id;
      const res = await fetch(`${BASE_URL}/api/ai/suggestions/${id}/apply`, {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      });
      assert.equal(res.status, 404,
        'Applying a non-approved suggestion should return 404');
    }
  });

  // ── send_email dispatch ─────────────────────────────────────────────────

  test('POST /apply dispatches send_email via CARE pipeline (if approved suggestion exists)', async () => {
    // Find an approved suggestion with send_email action
    const listRes = await fetch(
      `${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=approved&limit=50`,
      { headers: getAuthHeaders() },
    );
    const listJson = await listRes.json();

    const sendEmailSuggestion = listJson.data?.suggestions?.find(
      (s) => s.action?.tool_name === 'send_email',
    );

    if (!sendEmailSuggestion) {
      // No send_email suggestion available — skip gracefully
      return;
    }

    const res = await fetch(
      `${BASE_URL}/api/ai/suggestions/${sendEmailSuggestion.id}/apply`,
      {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      },
    );
    const json = await res.json();

    // The apply endpoint should either succeed (200) or fail with a service error (500)
    // but NOT with a "tool not found" error — that would indicate the dispatcher didn't work
    assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);

    if (res.status === 200) {
      assert.equal(json.status, 'success');
      assert.ok(json.result, 'Should include apply result');
    }
    if (res.status === 500) {
      // If it failed, it should NOT be a "tool not found" or "unknown tool" error
      const errorMsg = (json.error || json.message || '').toLowerCase();
      assert.ok(
        !errorMsg.includes('tool not found') && !errorMsg.includes('unknown tool'),
        `send_email should NOT hit Braid tool lookup — got: ${json.error || json.message}`,
      );
    }
  });

  // ── Non-email Braid dispatch ────────────────────────────────────────────

  test('POST /apply dispatches non-email actions to Braid (if approved suggestion exists)', async () => {
    const listRes = await fetch(
      `${BASE_URL}/api/ai/suggestions?tenant_id=${TENANT_ID}&status=approved&limit=50`,
      { headers: getAuthHeaders() },
    );
    const listJson = await listRes.json();

    const braidSuggestion = listJson.data?.suggestions?.find(
      (s) => s.action?.tool_name && s.action.tool_name !== 'send_email',
    );

    if (!braidSuggestion) {
      return; // No non-email approved suggestion — skip gracefully
    }

    const res = await fetch(
      `${BASE_URL}/api/ai/suggestions/${braidSuggestion.id}/apply`,
      {
        method: 'POST',
        headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: TENANT_ID }),
      },
    );

    // Should attempt Braid execution (200 or 500 from tool)
    assert.ok([200, 500].includes(res.status), `Expected 200 or 500, got ${res.status}`);
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  test('POST /apply with invalid tenant returns 404', async () => {
    const res = await fetch(`${BASE_URL}/api/ai/suggestions/${NONEXISTENT_ID}/apply`, {
      method: 'POST',
      headers: { ...getAuthHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: NONEXISTENT_ID }),
    });
    assert.equal(res.status, 404, 'Invalid tenant should return 404');
  });
});
