/**
 * Twilio Integration Tests
 *
 * Tests for per-tenant Twilio SMS endpoints:
 *   POST /api/integrations/twilio/send-sms
 *   GET  /api/integrations/twilio/status
 *   GET  /api/integrations/twilio/config
 */

import { describe, test, expect } from 'vitest';

const BASE_URL = process.env.BACKEND_URL || 'http://localhost:4001';
const TENANT_ID = process.env.TEST_TENANT_ID || '550e8400-e29b-41d4-a716-446655440000';
const SHOULD_RUN = process.env.RUN_INTEGRATION_TESTS === 'true' || process.env.CI;

describe('Twilio Integration', { skip: !SHOULD_RUN }, () => {

  // ── send-sms ──

  test('POST /api/integrations/twilio/send-sms returns 400 without tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ to: '+15551234567', body: 'test' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.status).toBe('error');
    expect(json.message).toContain('tenant_id');
  });

  test('POST /api/integrations/twilio/send-sms returns 400 without to', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, body: 'test' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('to');
  });

  test('POST /api/integrations/twilio/send-sms returns 400 without body', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tenant_id: TENANT_ID, to: '+15551234567' }),
    });
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toContain('body');
  });

  test('POST /api/integrations/twilio/send-sms accepts valid payload (dev mock or real)', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/send-sms`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenant_id: TENANT_ID,
        to: '+15551234567',
        body: 'Integration test SMS',
      }),
    });
    // In dev with no Twilio creds: 200 with mock result
    // In real env: 200 with queued or 502 with Twilio error
    const json = await res.json();
    expect(json).toBeDefined();
    // If success, should have data.provider = 'twilio'
    if (json.status === 'success') {
      expect(json.data.provider).toBe('twilio');
      expect(json.data.to || json.data.message_sid).toBeTruthy();
    }
  });

  // ── status ──

  test('GET /api/integrations/twilio/status returns 400 without tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/status`);
    expect(res.status).toBe(400);
  });

  test('GET /api/integrations/twilio/status returns config info for tenant', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/status?tenant_id=${TENANT_ID}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.data).toHaveProperty('configured');
    expect(json.data).toHaveProperty('status');
  });

  // ── config ──

  test('GET /api/integrations/twilio/config returns 400 without tenant_id', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/config`);
    expect(res.status).toBe(400);
  });

  test('GET /api/integrations/twilio/config returns safe config for tenant', async () => {
    const res = await fetch(`${BASE_URL}/api/integrations/twilio/config?tenant_id=${TENANT_ID}`);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('success');
    expect(json.data).toHaveProperty('configured');
    // Should never expose raw auth_token
    expect(JSON.stringify(json.data)).not.toContain('auth_token');
  });
});
