/**
 * Unit tests for backend/lib/billing/billingStateMachine.js
 *
 * Pure-logic tests for computeBillingState() and canAutoTransition().
 * No DB access. The DB-touching syncTenantBillingState() is exercised
 * by the billing-schema-alignment integration test.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_STATES,
  VALID_STATES,
  canAutoTransition,
  computeBillingState,
} from '../../lib/billing/billingStateMachine.js';

describe('billingStateMachine -- VALID_STATES', () => {
  it('contains all 6 canonical states', () => {
    assert.equal(VALID_STATES.size, 6);
    for (const s of [
      'active',
      'past_due',
      'grace_period',
      'suspended',
      'billing_exempt',
      'canceled',
    ]) {
      assert.ok(VALID_STATES.has(s), `missing state: ${s}`);
    }
  });
});

describe('billingStateMachine -- computeBillingState', () => {
  it('exempt flag trumps everything, including suspended subscription', () => {
    const state = computeBillingState({
      billingAccount: { billing_exempt: true },
      subscription: { status: 'suspended' },
    });
    assert.equal(state, BILLING_STATES.BILLING_EXEMPT);
  });

  it('no subscription + no account = active (default for fresh tenant)', () => {
    const state = computeBillingState({ billingAccount: null, subscription: null });
    assert.equal(state, BILLING_STATES.ACTIVE);
  });

  it('canceled subscription = canceled', () => {
    const state = computeBillingState({
      billingAccount: { billing_exempt: false },
      subscription: { status: 'canceled' },
    });
    assert.equal(state, BILLING_STATES.CANCELED);
  });

  it('draft subscription = active (tenant has plan assigned but not started)', () => {
    const state = computeBillingState({
      billingAccount: null,
      subscription: { status: 'draft' },
    });
    assert.equal(state, BILLING_STATES.ACTIVE);
  });

  it('subscription.status passes through for all valid states', () => {
    for (const s of ['active', 'past_due', 'grace_period', 'suspended']) {
      const state = computeBillingState({
        billingAccount: { billing_exempt: false },
        subscription: { status: s },
      });
      assert.equal(state, s, `expected ${s} to pass through`);
    }
  });

  it('unknown subscription status falls back to active (defensive default)', () => {
    const state = computeBillingState({
      billingAccount: null,
      subscription: { status: 'some_future_state' },
    });
    assert.equal(state, BILLING_STATES.ACTIVE);
  });

  it('exempt=false with no subscription = active', () => {
    const state = computeBillingState({
      billingAccount: { billing_exempt: false },
      subscription: null,
    });
    assert.equal(state, BILLING_STATES.ACTIVE);
  });
});

describe('billingStateMachine -- canAutoTransition', () => {
  it('allows self-transitions (idempotent sync)', () => {
    for (const s of VALID_STATES) {
      assert.equal(canAutoTransition(s, s), true, `self-transition ${s}->${s} should be allowed`);
    }
  });

  it('allows active -> past_due', () => {
    assert.equal(canAutoTransition('active', 'past_due'), true);
  });

  it('allows past_due -> grace_period -> suspended progression', () => {
    assert.equal(canAutoTransition('past_due', 'grace_period'), true);
    assert.equal(canAutoTransition('grace_period', 'suspended'), true);
  });

  it('allows recovery paths: past_due -> active, grace_period -> active, suspended -> active', () => {
    assert.equal(canAutoTransition('past_due', 'active'), true);
    assert.equal(canAutoTransition('grace_period', 'active'), true);
    assert.equal(canAutoTransition('suspended', 'active'), true);
  });

  it('allows any non-exempt state to be canceled', () => {
    for (const s of ['active', 'past_due', 'grace_period', 'suspended']) {
      assert.equal(canAutoTransition(s, 'canceled'), true, `${s} -> canceled should be allowed`);
    }
  });

  it('blocks auto-transitions INTO billing_exempt (admin-only)', () => {
    for (const s of ['active', 'past_due', 'grace_period', 'suspended', 'canceled']) {
      assert.equal(
        canAutoTransition(s, 'billing_exempt'),
        false,
        `${s} -> billing_exempt must NOT be auto-allowed`,
      );
    }
  });

  it('blocks auto-transitions OUT of billing_exempt (admin-only)', () => {
    for (const s of VALID_STATES) {
      if (s === 'billing_exempt') continue;
      assert.equal(
        canAutoTransition('billing_exempt', s),
        false,
        `billing_exempt -> ${s} must NOT be auto-allowed`,
      );
    }
  });

  it('blocks auto-transitions out of canceled (terminal)', () => {
    for (const s of VALID_STATES) {
      if (s === 'canceled') continue;
      assert.equal(
        canAutoTransition('canceled', s),
        false,
        `canceled -> ${s} must NOT be auto-allowed`,
      );
    }
  });

  it('rejects invalid state names', () => {
    assert.equal(canAutoTransition('bogus', 'active'), false);
    assert.equal(canAutoTransition('active', 'bogus'), false);
    assert.equal(canAutoTransition(null, 'active'), false);
  });

  it('blocks skipping grace_period (active -> suspended not allowed)', () => {
    assert.equal(canAutoTransition('active', 'suspended'), false);
    assert.equal(canAutoTransition('active', 'grace_period'), false);
  });
});
