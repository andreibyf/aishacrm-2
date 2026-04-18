/**
 * Unit tests for backend/lib/billing/subscriptionService.js
 *
 * Covers:
 *   - assignPlan validation + rejection when active sub exists
 *   - changePlan flow (cancel old + create new + PLAN_CHANGED event)
 *   - cancelSubscription + tenant.billing_state sync
 *   - Plan validation (not found / inactive)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBillingMock } from './_billingMock.js';
import {
  getActiveSubscription,
  assignPlan,
  changePlan,
  cancelSubscription,
} from '../../lib/billing/subscriptionService.js';

const TENANT = 'tenant-ccc';
const ACTOR = 'user-admin-3';

function fresh() {
  return createBillingMock({
    billing_plans: [
      {
        id: 'plan-starter',
        code: 'starter_monthly',
        billing_interval: 'month',
        amount_cents: 4900,
        is_active: true,
      },
      {
        id: 'plan-growth',
        code: 'growth_monthly',
        billing_interval: 'month',
        amount_cents: 14900,
        is_active: true,
      },
      {
        id: 'plan-legacy',
        code: 'legacy_plan',
        billing_interval: 'month',
        amount_cents: 9900,
        is_active: false,
      },
    ],
    billing_accounts: [],
    tenant_subscriptions: [],
    billing_events: [],
    tenant: [{ id: TENANT, billing_state: 'active' }],
  });
}

describe('subscriptionService -- assignPlan', () => {
  it('creates active subscription with renewal_date for monthly plan', async () => {
    const mock = fresh();
    const before = Date.now();
    const sub = await assignPlan(mock, {
      tenant_id: TENANT,
      plan_code: 'starter_monthly',
      actor_id: ACTOR,
    });

    assert.equal(sub.status, 'active');
    assert.equal(sub.billing_plan_id, 'plan-starter');
    assert.ok(sub.renewal_date, 'monthly plan must have renewal_date');

    const renewalMs = new Date(sub.renewal_date).getTime();
    const expectedMin = before + 27 * 24 * 60 * 60 * 1000;
    const expectedMax = before + 32 * 24 * 60 * 60 * 1000;
    assert.ok(
      renewalMs >= expectedMin && renewalMs <= expectedMax,
      `renewal_date (${sub.renewal_date}) should be ~1 month from now`,
    );

    const types = mock.db.billing_events.map((e) => e.event_type);
    assert.ok(types.includes('plan.assigned'));
    assert.ok(types.includes('subscription.created'));

    assert.equal(mock.db.tenant[0].billing_state, 'active');
  });

  it('rejects when plan_code does not exist', async () => {
    const mock = fresh();
    await assert.rejects(
      () => assignPlan(mock, { tenant_id: TENANT, plan_code: 'no_such_plan' }),
      /not found or inactive/,
    );
  });

  it('rejects inactive plan', async () => {
    const mock = fresh();
    await assert.rejects(
      () => assignPlan(mock, { tenant_id: TENANT, plan_code: 'legacy_plan' }),
      /not found or inactive/,
    );
  });

  it('rejects when tenant already has active subscription', async () => {
    const mock = fresh();
    await assignPlan(mock, { tenant_id: TENANT, plan_code: 'starter_monthly', actor_id: ACTOR });
    await assert.rejects(
      () => assignPlan(mock, { tenant_id: TENANT, plan_code: 'growth_monthly', actor_id: ACTOR }),
      /already has an active subscription/,
    );
  });

  it('rejects missing tenant_id / plan_code', async () => {
    const mock = fresh();
    await assert.rejects(
      () => assignPlan(mock, { plan_code: 'starter_monthly' }),
      /tenant_id required/,
    );
    await assert.rejects(() => assignPlan(mock, { tenant_id: TENANT }), /plan_code required/);
  });
});

describe('subscriptionService -- getActiveSubscription', () => {
  it('returns null when tenant has no subscription', async () => {
    const mock = fresh();
    const sub = await getActiveSubscription(mock, TENANT);
    assert.equal(sub, null);
  });

  it('returns the active subscription ignoring canceled ones', async () => {
    const mock = fresh();
    mock.db.tenant_subscriptions = [
      {
        id: 's1',
        tenant_id: TENANT,
        billing_plan_id: 'plan-starter',
        status: 'canceled',
        created_at: '2026-01-01',
      },
      {
        id: 's2',
        tenant_id: TENANT,
        billing_plan_id: 'plan-growth',
        status: 'active',
        created_at: '2026-02-01',
      },
    ];
    const sub = await getActiveSubscription(mock, TENANT);
    assert.equal(sub.id, 's2');
  });
});

describe('subscriptionService -- changePlan', () => {
  it('cancels old sub, creates new one, emits PLAN_CHANGED', async () => {
    const mock = fresh();
    const old = await assignPlan(mock, {
      tenant_id: TENANT,
      plan_code: 'starter_monthly',
      actor_id: ACTOR,
    });

    const next = await changePlan(mock, {
      tenant_id: TENANT,
      plan_code: 'growth_monthly',
      actor_id: ACTOR,
    });

    assert.equal(next.billing_plan_id, 'plan-growth');
    assert.equal(next.status, 'active');

    const oldRow = mock.db.tenant_subscriptions.find((s) => s.id === old.id);
    assert.equal(oldRow.status, 'canceled');

    const changedEvent = mock.db.billing_events.find((e) => e.event_type === 'plan.changed');
    assert.ok(changedEvent, 'plan.changed event must be logged');
    assert.equal(changedEvent.payload_json.from_subscription_id, old.id);
    assert.equal(changedEvent.payload_json.to_subscription_id, next.id);
    assert.equal(changedEvent.payload_json.to_plan_code, 'growth_monthly');
  });

  it('rejects when no active subscription exists', async () => {
    const mock = fresh();
    await assert.rejects(
      () => changePlan(mock, { tenant_id: TENANT, plan_code: 'growth_monthly', actor_id: ACTOR }),
      /use assignPlan/,
    );
  });

  it('rejects change to same plan', async () => {
    const mock = fresh();
    await assignPlan(mock, { tenant_id: TENANT, plan_code: 'starter_monthly', actor_id: ACTOR });
    await assert.rejects(
      () => changePlan(mock, { tenant_id: TENANT, plan_code: 'starter_monthly', actor_id: ACTOR }),
      /already on/,
    );
  });

  it('rejects change to inactive plan without canceling the existing one', async () => {
    const mock = fresh();
    const existing = await assignPlan(mock, {
      tenant_id: TENANT,
      plan_code: 'starter_monthly',
      actor_id: ACTOR,
    });
    await assert.rejects(
      () => changePlan(mock, { tenant_id: TENANT, plan_code: 'legacy_plan', actor_id: ACTOR }),
      /not found or inactive/,
    );
    const row = mock.db.tenant_subscriptions.find((s) => s.id === existing.id);
    assert.equal(row.status, 'active', 'existing sub must remain active on failed change');
  });
});

describe('subscriptionService -- cancelSubscription', () => {
  it('cancels active subscription and syncs tenant.billing_state to canceled', async () => {
    const mock = fresh();
    await assignPlan(mock, { tenant_id: TENANT, plan_code: 'starter_monthly', actor_id: ACTOR });

    const canceled = await cancelSubscription(mock, {
      tenant_id: TENANT,
      actor_id: ACTOR,
      reason: 'customer request',
    });

    assert.equal(canceled.status, 'canceled');
    assert.ok(canceled.canceled_at);

    const ev = mock.db.billing_events.find((e) => e.event_type === 'subscription.canceled');
    assert.equal(ev.payload_json.reason, 'customer request');

    assert.equal(mock.db.tenant[0].billing_state, 'canceled');
  });

  it('rejects when no active subscription', async () => {
    const mock = fresh();
    await assert.rejects(
      () => cancelSubscription(mock, { tenant_id: TENANT, actor_id: ACTOR }),
      /no active subscription/,
    );
  });

  it('requires actor_id', async () => {
    const mock = fresh();
    await assignPlan(mock, { tenant_id: TENANT, plan_code: 'starter_monthly', actor_id: ACTOR });
    await assert.rejects(
      () => cancelSubscription(mock, { tenant_id: TENANT }),
      /actor_id required/,
    );
  });
});
