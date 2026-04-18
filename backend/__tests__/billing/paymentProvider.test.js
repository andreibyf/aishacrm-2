/**
 * Unit tests for backend/lib/billing/paymentProvider.js
 *
 * Ensures adapters implementing the provider interface are correctly
 * validated at runtime.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { assertProviderInterface } from '../../lib/billing/paymentProvider.js';

const completeAdapter = {
  createCustomer: async () => ({ id: 'c_1' }),
  createCheckoutSession: async () => ({ id: 's_1', url: 'https://example.com' }),
  createPortalSession: async () => ({ url: 'https://example.com' }),
  verifyWebhookSignature: () => ({ event: {} }),
  normalizePaymentEvent: () => ({ type: 'test' }),
};

describe('paymentProvider -- assertProviderInterface', () => {
  it('accepts a fully-implemented adapter', () => {
    assert.doesNotThrow(() => assertProviderInterface(completeAdapter));
  });

  it('rejects adapter missing createCustomer', () => {
    const { createCustomer, ...partial } = completeAdapter;
    assert.throws(() => assertProviderInterface(partial), /createCustomer/);
  });

  it('rejects adapter missing createCheckoutSession', () => {
    const { createCheckoutSession, ...partial } = completeAdapter;
    assert.throws(() => assertProviderInterface(partial), /createCheckoutSession/);
  });

  it('rejects adapter missing verifyWebhookSignature', () => {
    const { verifyWebhookSignature, ...partial } = completeAdapter;
    assert.throws(() => assertProviderInterface(partial), /verifyWebhookSignature/);
  });

  it('rejects adapter missing normalizePaymentEvent', () => {
    const { normalizePaymentEvent, ...partial } = completeAdapter;
    assert.throws(() => assertProviderInterface(partial), /normalizePaymentEvent/);
  });

  it('lists ALL missing methods in the error', () => {
    const partial = { createCustomer: completeAdapter.createCustomer };
    try {
      assertProviderInterface(partial);
      assert.fail('should have thrown');
    } catch (err) {
      assert.match(err.message, /createCheckoutSession/);
      assert.match(err.message, /createPortalSession/);
      assert.match(err.message, /verifyWebhookSignature/);
      assert.match(err.message, /normalizePaymentEvent/);
    }
  });

  it('rejects null / undefined', () => {
    assert.throws(() => assertProviderInterface(null), /missing methods/);
    assert.throws(() => assertProviderInterface(undefined), /missing methods/);
  });

  it('rejects adapter where method is a string, not a function', () => {
    const bad = { ...completeAdapter, createCustomer: 'not a fn' };
    assert.throws(() => assertProviderInterface(bad), /createCustomer/);
  });
});
