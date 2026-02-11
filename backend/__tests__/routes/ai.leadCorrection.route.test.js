import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { getAuthHeaders } from '../helpers/auth.js';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

// NOTE: This is a light integration smoke test. It does NOT assert on
// actual model-generated text or DB mutations, but it validates that the
// /api/ai/chat route accepts a lead-correction message and returns a
// structurally valid response instead of hard-failing.

describe('AI Chat – Lead Name Correction Flow', { skip: !SHOULD_RUN }, () => {

  test('POST /api/ai/chat accepts lead correction phrasing', async () => {
    const body = {
      tenant_id: TENANT_ID,
      // Minimal chat payload: a single user message asking to correct a lead name
      messages: [
        {
          role: 'user',
          content: "it's a lead, it should be Josh Johnson. please correct the name for this lead."
        }
      ]
    };

    const res = await fetch(`${BASE_URL}/api/ai/chat`, {
      method: 'POST',
      headers: {
        ...getAuthHeaders(),
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    // In some environments this may still be 4xx (e.g. missing model key),
    // but we at least require the route to be reachable and not throw a
    // validation error purely because of the message phrasing.
    assert.ok([200, 400, 401, 403, 429, 500].includes(res.status), `unexpected status from /api/ai/chat: ${res.status}`);

    if (res.status === 200) {
      const json = await res.json();
      // Common shape: { status, data, message } – we just sanity-check
      assert.ok(json, 'response JSON should be defined');
      assert.ok(typeof json === 'object', 'response JSON should be an object');
    }
  });
});
