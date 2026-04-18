/**
 * Unit tests for backend/lib/billing/stripePlatformAdapter.js
 *
 * Focused on pure-logic surfaces:
 *   - normalizePaymentEvent() shape transformation
 *   - interface conformance (exports match provider contract)
 *
 * Calls that actually invoke Stripe (createCustomer, createCheckoutSession,
 * verifyWebhookSignature) are tested via integration tests in PR 3.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import * as adapter from '../../lib/billing/stripePlatformAdapter.js';
import { assertProviderInterface } from '../../lib/billing/paymentProvider.js';

describe('stripePlatformAdapter -- interface conformance', () => {
  it('implements the full payment provider interface', () => {
    assert.doesNotThrow(() => assertProviderInterface(adapter));
  });
});

describe('stripePlatformAdapter -- normalizePaymentEvent', () => {
  it('returns null for empty or malformed event', () => {
    assert.equal(adapter.normalizePaymentEvent(null), null);
    assert.equal(adapter.normalizePaymentEvent({}), null);
    assert.equal(adapter.normalizePaymentEvent({ type: '' }), null);
  });

  it('extracts tenant_id from metadata', () => {
    const event = {
      type: 'checkout.session.completed',
      data: {
        object: {
          id: 'cs_123',
          metadata: { tenant_id: 'tenant-abc' },
          amount_total: 4900,
          currency: 'usd',
          payment_intent: 'pi_456',
        },
      },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.type, 'checkout.session.completed');
    assert.equal(normalized.tenant_id, 'tenant-abc');
    assert.equal(normalized.amount_cents, 4900);
    assert.equal(normalized.currency, 'usd');
    assert.equal(normalized.payment_intent_id, 'pi_456');
  });

  it('falls back to client_reference_id when metadata.tenant_id missing', () => {
    const event = {
      type: 'checkout.session.completed',
      data: { object: { id: 'cs_1', client_reference_id: 'tenant-xyz' } },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.tenant_id, 'tenant-xyz');
  });

  it('handles payment_intent.succeeded events (top-level intent id)', () => {
    const event = {
      type: 'payment_intent.succeeded',
      data: {
        object: {
          object: 'payment_intent',
          id: 'pi_789',
          amount: 2500,
          currency: 'usd',
          metadata: { tenant_id: 't1' },
          latest_charge: 'ch_111',
        },
      },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.payment_intent_id, 'pi_789');
    assert.equal(normalized.charge_id, 'ch_111');
    assert.equal(normalized.amount_cents, 2500);
  });

  it('handles charge events (top-level charge id)', () => {
    const event = {
      type: 'charge.succeeded',
      data: {
        object: {
          object: 'charge',
          id: 'ch_222',
          amount: 10000,
          currency: 'usd',
          metadata: {},
        },
      },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.charge_id, 'ch_222');
    assert.equal(normalized.payment_intent_id, null);
  });

  it('returns null tenant_id if neither metadata nor client_reference_id is set', () => {
    const event = {
      type: 'payment_intent.payment_failed',
      data: { object: { id: 'pi_1', metadata: {} } },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.tenant_id, null);
  });

  it('preserves raw_object_id for webhook correlation', () => {
    const event = {
      type: 'whatever',
      data: { object: { id: 'obj_xyz', metadata: {} } },
    };
    const normalized = adapter.normalizePaymentEvent(event);
    assert.equal(normalized.raw_object_id, 'obj_xyz');
  });
});
