/**
 * Tests for careWorkflowTriggerClient
 * 
 * PR8: Workflow Webhook Trigger Integration
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { triggerCareWorkflow, generateSignature } from './careWorkflowTriggerClient.js';

describe('careWorkflowTriggerClient', () => {
  describe('generateSignature', () => {
    it('should generate consistent HMAC-SHA256 signature', () => {
      const payload = JSON.stringify({ test: 'data' });
      const secret = 'test-secret';
      
      const sig1 = generateSignature(payload, secret);
      const sig2 = generateSignature(payload, secret);
      
      assert.strictEqual(sig1, sig2);
      assert.strictEqual(typeof sig1, 'string');
      assert.strictEqual(sig1.length, 64); // SHA256 hex = 64 chars
    });

    it('should generate different signatures for different payloads', () => {
      const secret = 'test-secret';
      const sig1 = generateSignature(JSON.stringify({ test: 'data1' }), secret);
      const sig2 = generateSignature(JSON.stringify({ test: 'data2' }), secret);
      
      assert.notStrictEqual(sig1, sig2);
    });

    it('should generate different signatures for different secrets', () => {
      const payload = JSON.stringify({ test: 'data' });
      const sig1 = generateSignature(payload, 'secret1');
      const sig2 = generateSignature(payload, 'secret2');
      
      assert.notStrictEqual(sig1, sig2);
    });
  });

  describe('triggerCareWorkflow', () => {
    let originalFetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('should return failure when URL is not provided', async () => {
      const result = await triggerCareWorkflow({
        url: '',
        payload: { event_id: 'test-123', type: 'care.escalation_detected' }
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should succeed when webhook responds with 200', async () => {
      global.fetch = async () => ({
        ok: true,
        status: 200,
        statusText: 'OK'
      });

      const result = await triggerCareWorkflow({
        url: 'http://test.webhook/trigger',
        payload: {
          event_id: 'test-123',
          type: 'care.escalation_detected',
          ts: new Date().toISOString()
        },
        timeout_ms: 1000,
        retries: 0
      });

      assert.strictEqual(result.success, true);
    });

    it('should retry on failure and eventually fail gracefully', async () => {
      let callCount = 0;
      global.fetch = async () => {
        callCount++;
        return {
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        };
      };

      const result = await triggerCareWorkflow({
        url: 'http://test.webhook/trigger',
        payload: {
          event_id: 'test-456',
          type: 'care.escalation_detected'
        },
        timeout_ms: 100,
        retries: 2
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.strictEqual(callCount, 3); // Initial + 2 retries
    });

    it('should handle timeout gracefully', async () => {
      global.fetch = async (url, options) => {
        return new Promise((resolve, reject) => {
          // Simulate slow response
          setTimeout(() => {
            resolve({ ok: true, status: 200 });
          }, 5000);
          
          // Listen for abort
          if (options.signal) {
            options.signal.addEventListener('abort', () => {
              const error = new Error('Request aborted');
              error.name = 'AbortError';
              reject(error);
            });
          }
        });
      };

      const result = await triggerCareWorkflow({
        url: 'http://test.webhook/trigger',
        payload: {
          event_id: 'test-789',
          type: 'care.escalation_detected'
        },
        timeout_ms: 50, // Very short timeout
        retries: 0
      });

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
      assert.ok(result.error.includes('Timeout'));
    });

    it('should include signature header when secret provided', async () => {
      let capturedHeaders;
      global.fetch = async (url, options) => {
        capturedHeaders = options.headers;
        return { ok: true, status: 200 };
      };

      await triggerCareWorkflow({
        url: 'http://test.webhook/trigger',
        secret: 'test-secret',
        payload: {
          event_id: 'test-sig',
          type: 'care.escalation_detected'
        },
        retries: 0
      });

      assert.ok(capturedHeaders['X-AISHA-SIGNATURE']);
      assert.ok(capturedHeaders['X-AISHA-EVENT-ID']);
      assert.strictEqual(capturedHeaders['X-AISHA-EVENT-ID'], 'test-sig');
    });

    it('should not throw on network errors', async () => {
      global.fetch = async () => {
        throw new Error('Network failure');
      };

      const result = await triggerCareWorkflow({
        url: 'http://test.webhook/trigger',
        payload: {
          event_id: 'test-error',
          type: 'care.escalation_detected'
        },
        timeout_ms: 100,
        retries: 1
      });

      // Should not throw, should return gracefully
      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });
  });
});
