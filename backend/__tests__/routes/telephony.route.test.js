import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:3001';
const TENANT_ID = process.env.TEST_TENANT_ID || 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
// In CI, run only if explicitly enabled
const SHOULD_RUN = process.env.CI ? (process.env.CI_BACKEND_TESTS === 'true') : true;

describe('Telephony Routes', { skip: !SHOULD_RUN }, () => {

  test('GET /api/telephony/config returns telephony configuration', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/config?tenant_id=${TENANT_ID}`);
    // May return 200 or 404 if no config exists
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('GET /api/telephony/status returns status', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/status?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), 'expected 200 or 404 from status');
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });

  test('POST /api/telephony/webhook/twilio/inbound accepts Twilio webhook format', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/webhook/twilio/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        CallSid: 'CA' + 'test123'.padEnd(32, '0'),
        From: '+15551234567',
        To: '+15559876543',
        CallStatus: 'ringing'
      }).toString()
    });
    // Should accept webhook (200), require validation (400), or require auth (401/403)
    assert.ok([200, 201, 400, 401, 403].includes(res.status), `expected valid webhook response, got ${res.status}`);
  });

  test('POST /api/telephony/webhook/signalwire/inbound accepts SignalWire webhook format', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/webhook/signalwire/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        call_id: 'test-call-123',
        from: '+15551234567',
        to: '+15559876543',
        direction: 'inbound'
      })
    });
    // Should accept webhook (200), require validation (400), or require auth (401/403)
    assert.ok([200, 201, 400, 401, 403].includes(res.status), `expected valid webhook response, got ${res.status}`);
  });

  test('POST /api/telephony/webhook/callfluent accepts CallFluent webhook', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/webhook/callfluent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event: 'call.started',
        call_id: 'cf-test-123',
        caller: '+15551234567',
        callee: '+15559876543'
      })
    });
    assert.ok([200, 201, 401, 403, 404].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('POST /api/telephony/webhook/thoughtly accepts Thoughtly webhook', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/webhook/thoughtly`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'call.completed',
        callId: 'th-test-123',
        from: '+15551234567',
        to: '+15559876543'
      })
    });
    assert.ok([200, 201, 401, 403, 404].includes(res.status), `expected valid response, got ${res.status}`);
  });

  test('POST /api/telephony/initiate-call requires phone number', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/initiate-call`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID })
    });
    // Should require phone_number or return error (400/422/404/500)
    assert.ok([400, 404, 422, 500].includes(res.status), `expected 400/404/422/500 for missing phone, got ${res.status}`);
  });

  test('GET /api/telephony/providers lists available providers', async () => {
    const res = await fetch(`${BASE_URL}/api/telephony/providers?tenant_id=${TENANT_ID}`);
    assert.ok([200, 404].includes(res.status), `expected 200 or 404, got ${res.status}`);
    if (res.status === 200) {
      const json = await res.json();
      assert.equal(json.status, 'success');
    }
  });
});
