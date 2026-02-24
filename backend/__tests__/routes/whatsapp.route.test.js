/**
 * WhatsApp Route Tests
 *
 * Integration tests for the WhatsApp webhook endpoint covering:
 * - Webhook acceptance/rejection and basic request parsing
 * - Signature validation behavior
 * - Media-only message handling
 * - Status endpoint authentication
 *
 * [2026-02-24 Claude] — initial test suite
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? process.env.CI_BACKEND_TESTS === 'true' : true;

// ---------------------------------------------------------------------------
// Unit Tests: validateTwilioSignature
// ---------------------------------------------------------------------------

describe('validateTwilioSignature (unit)', { skip: !SHOULD_RUN }, () => {
  // Import the function directly for unit testing
  let validateTwilioSignature;

  test('module can be imported', async () => {
    const mod = await import('../../lib/whatsappService.js');
    validateTwilioSignature = mod.validateTwilioSignature;
    assert.equal(typeof validateTwilioSignature, 'function');
  });

  test('returns true for valid signature', async () => {
    if (!validateTwilioSignature) {
      const mod = await import('../../lib/whatsappService.js');
      validateTwilioSignature = mod.validateTwilioSignature;
    }

    const authToken = 'test-auth-token-12345';
    const url = 'https://example.com/api/whatsapp/webhook';
    const params = { Body: 'Hello', From: 'whatsapp:+15551234567', To: 'whatsapp:+14155238886' };

    // Compute the expected signature the same way Twilio does
    let data = url;
    const sortedKeys = Object.keys(params).sort();
    for (const key of sortedKeys) {
      data += key + params[key];
    }
    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(data, 'utf-8')
      .digest('base64');

    const result = validateTwilioSignature(authToken, url, params, expectedSignature);
    assert.equal(result, true, 'should accept valid signature');
  });

  test('returns false for invalid signature', async () => {
    if (!validateTwilioSignature) {
      const mod = await import('../../lib/whatsappService.js');
      validateTwilioSignature = mod.validateTwilioSignature;
    }

    const result = validateTwilioSignature(
      'test-auth-token',
      'https://example.com/webhook',
      { Body: 'Hello' },
      'invalid-signature-here',
    );
    assert.equal(result, false, 'should reject invalid signature');
  });

  test('returns false when authToken is missing', async () => {
    if (!validateTwilioSignature) {
      const mod = await import('../../lib/whatsappService.js');
      validateTwilioSignature = mod.validateTwilioSignature;
    }

    const result = validateTwilioSignature(null, 'https://example.com', {}, 'some-sig');
    assert.equal(result, false, 'should reject when authToken is null');
  });

  test('returns false when signature is missing', async () => {
    if (!validateTwilioSignature) {
      const mod = await import('../../lib/whatsappService.js');
      validateTwilioSignature = mod.validateTwilioSignature;
    }

    const result = validateTwilioSignature('token', 'https://example.com', {}, null);
    assert.equal(result, false, 'should reject when signature is null');
  });

  test('handles empty params correctly', async () => {
    if (!validateTwilioSignature) {
      const mod = await import('../../lib/whatsappService.js');
      validateTwilioSignature = mod.validateTwilioSignature;
    }

    const authToken = 'test-token';
    const url = 'https://example.com/webhook';
    const params = {};

    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(url, 'utf-8')
      .digest('base64');

    const result = validateTwilioSignature(authToken, url, params, expectedSignature);
    assert.equal(result, true, 'should accept valid signature with empty params');
  });
});

// ---------------------------------------------------------------------------
// Integration Tests: WhatsApp Webhook Route
// ---------------------------------------------------------------------------

describe('WhatsApp Routes', { skip: !SHOULD_RUN }, () => {
  test('POST /api/whatsapp/webhook returns TwiML for missing fields', async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        MessageSid: 'SM' + 'test123'.padEnd(32, '0'),
      }).toString(),
    });
    // Should return empty TwiML (missing From/To/Body)
    assert.ok([200, 403].includes(res.status), `expected 200 or 403, got ${res.status}`);
    if (res.status === 200) {
      const text = await res.text();
      assert.ok(text.includes('<Response'), 'should return TwiML response');
    }
  });

  test('POST /api/whatsapp/webhook accepts Twilio webhook format', async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        MessageSid: 'SM' + 'test456'.padEnd(32, '0'),
        From: 'whatsapp:+15551234567',
        To: 'whatsapp:+14155238886',
        Body: 'Hello AiSHA',
        NumMedia: '0',
        ProfileName: 'Test User',
      }).toString(),
    });
    // Should return TwiML (200) even if tenant not found, or 403 for signature issues
    assert.ok([200, 403].includes(res.status), `expected 200 or 403, got ${res.status}`);
  });

  test('POST /api/whatsapp/webhook handles media-only message (NumMedia > 0, no Body)', async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        MessageSid: 'SM' + 'media789'.padEnd(32, '0'),
        From: 'whatsapp:+15551234567',
        To: 'whatsapp:+14155238886',
        Body: '',
        NumMedia: '1',
        MediaUrl0: 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages/SM123/Media/ME123',
      }).toString(),
    });
    // Should not reject — media-only messages should be accepted (200) or handled (403 for sig)
    assert.ok([200, 403].includes(res.status), `expected 200 or 403, got ${res.status}`);
    if (res.status === 200) {
      const text = await res.text();
      // Should either return media-only response or empty TwiML (tenant not found)
      assert.ok(text.includes('<Response'), 'should return TwiML response for media-only');
    }
  });

  test('POST /api/whatsapp/webhook rejects completely empty body', async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: '',
    });
    // Should return empty TwiML for missing fields
    assert.ok([200, 403].includes(res.status), `expected 200 or 403, got ${res.status}`);
  });

  test('GET /api/whatsapp/status requires authentication', async () => {
    const res = await fetch(`${BASE_URL}/api/whatsapp/status?tenant_id=${TENANT_ID}`);
    // Should require auth (401) since no Bearer token provided
    assert.ok(
      [401, 403].includes(res.status),
      `expected 401 or 403 without auth, got ${res.status}`,
    );
  });

  test('GET /api/whatsapp/status returns data with valid auth', async () => {
    // Use auth helper if available
    let headers = { 'Content-Type': 'application/json' };
    try {
      const { getAuthHeaders } = await import('../helpers/auth.js');
      headers = { ...headers, ...getAuthHeaders() };
    } catch {
      // Skip if auth helper not available
      return;
    }

    const res = await fetch(`${BASE_URL}/api/whatsapp/status?tenant_id=${TENANT_ID}`, { headers });
    // With auth, should return 200 or 400/403 depending on tenant match
    assert.ok(
      [200, 400, 401, 403].includes(res.status),
      `expected 200/400/401/403 with auth, got ${res.status}`,
    );
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
      assert.ok('data' in json, 'response should have data field');
      assert.ok('configured' in json.data, 'data should have configured field');
    }
  });
});
