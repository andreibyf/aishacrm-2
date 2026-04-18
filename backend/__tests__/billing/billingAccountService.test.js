/**
 * Unit tests for backend/lib/billing/billingAccountService.js
 *
 * Exercises exemption policy, audit trail, and field filtering using
 * the in-memory billing mock (_billingMock.js).
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createBillingMock } from './_billingMock.js';
import {
  getOrCreateBillingAccount,
  updateBillingProfile,
  setExemption,
  removeExemption,
} from '../../lib/billing/billingAccountService.js';

const TENANT = 'tenant-aaa';
const ACTOR = 'user-admin-1';

function seedTenant(mock, overrides = {}) {
  mock.db.tenant = [{ id: TENANT, billing_state: 'active', ...overrides }];
}

describe('billingAccountService -- getOrCreateBillingAccount', () => {
  it('creates an empty account on first access', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);

    const account = await getOrCreateBillingAccount(mock, TENANT);

    assert.equal(account.tenant_id, TENANT);
    assert.equal(account.billing_exempt, false); // schema default on create
    assert.equal(mock.db.billing_accounts.length, 1);
  });

  it('returns existing account without duplicating', async () => {
    const mock = createBillingMock({
      billing_accounts: [{ id: 'ba1', tenant_id: TENANT, billing_email: 'a@b.c' }],
      billing_events: [],
      tenant: [],
    });
    seedTenant(mock);

    const account = await getOrCreateBillingAccount(mock, TENANT);
    assert.equal(account.id, 'ba1');
    assert.equal(account.billing_email, 'a@b.c');
    assert.equal(mock.db.billing_accounts.length, 1);
  });

  it('throws when tenantId is missing', async () => {
    const mock = createBillingMock();
    await assert.rejects(() => getOrCreateBillingAccount(mock, null), /tenantId required/);
  });
});

describe('billingAccountService -- updateBillingProfile', () => {
  it('updates allowed fields', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);

    const updated = await updateBillingProfile(mock, TENANT, {
      billing_email: 'finance@acme.com',
      company_name: 'Acme Inc',
      tax_id: 'EIN-123',
    });

    assert.equal(updated.billing_email, 'finance@acme.com');
    assert.equal(updated.company_name, 'Acme Inc');
    assert.equal(updated.tax_id, 'EIN-123');
  });

  it('silently filters out non-allowed fields', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);

    const updated = await updateBillingProfile(mock, TENANT, {
      billing_email: 'f@acme.com',
      injected_field: 'should_be_dropped',
    });

    assert.equal(updated.billing_email, 'f@acme.com');
    assert.equal(updated.injected_field, undefined);
  });

  it('REJECTS attempts to modify billing_exempt via updateBillingProfile', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);

    await assert.rejects(
      () => updateBillingProfile(mock, TENANT, { billing_exempt: true }),
      /setExemption\(\) to modify/,
    );
  });

  it('REJECTS attempts to modify exempt_reason / exempt_set_by / exempt_set_at', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);
    for (const f of ['exempt_reason', 'exempt_set_by', 'exempt_set_at']) {
      await assert.rejects(
        () => updateBillingProfile(mock, TENANT, { [f]: 'anything' }),
        /setExemption\(\) to modify/,
        `${f} should be blocked from updateBillingProfile`,
      );
    }
  });

  it('throws when no updatable fields are provided', async () => {
    const mock = createBillingMock({ billing_accounts: [], tenant: [] });
    seedTenant(mock);
    await assert.rejects(() => updateBillingProfile(mock, TENANT, {}), /no updatable fields/);
  });
});

describe('billingAccountService -- setExemption', () => {
  it('sets billing_exempt=true with audit trail and writes billing_event', async () => {
    const mock = createBillingMock({
      billing_accounts: [],
      billing_events: [],
      tenant_subscriptions: [],
      tenant: [],
    });
    seedTenant(mock);

    const { account, stateChange } = await setExemption(mock, {
      tenant_id: TENANT,
      reason: 'Strategic partner, indefinite comp',
      actor_id: ACTOR,
    });

    assert.equal(account.billing_exempt, true);
    assert.equal(account.exempt_reason, 'Strategic partner, indefinite comp');
    assert.equal(account.exempt_set_by, ACTOR);
    assert.ok(account.exempt_set_at, 'exempt_set_at must be populated');

    // Event logged
    assert.equal(mock.db.billing_events.length, 1);
    assert.equal(mock.db.billing_events[0].event_type, 'tenant.billing_exempt_set');
    assert.equal(mock.db.billing_events[0].source, 'admin');
    assert.equal(mock.db.billing_events[0].actor_id, ACTOR);

    // Tenant state synced to billing_exempt
    assert.equal(stateChange.to, 'billing_exempt');
    assert.equal(mock.db.tenant[0].billing_state, 'billing_exempt');
  });

  it('rejects missing reason', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);
    await assert.rejects(
      () => setExemption(mock, { tenant_id: TENANT, actor_id: ACTOR }),
      /reason required/,
    );
  });

  it('rejects whitespace-only reason', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);
    await assert.rejects(
      () => setExemption(mock, { tenant_id: TENANT, actor_id: ACTOR, reason: '   ' }),
      /reason required/,
    );
  });

  it('rejects missing actor_id', async () => {
    const mock = createBillingMock({ billing_accounts: [], billing_events: [], tenant: [] });
    seedTenant(mock);
    await assert.rejects(
      () => setExemption(mock, { tenant_id: TENANT, reason: 'r' }),
      /actor_id required/,
    );
  });
});

describe('billingAccountService -- removeExemption', () => {
  it('clears exemption and logs event', async () => {
    const mock = createBillingMock({
      billing_accounts: [
        {
          id: 'ba1',
          tenant_id: TENANT,
          billing_exempt: true,
          exempt_reason: 'was comp',
          exempt_set_by: 'user-prev',
          exempt_set_at: '2026-01-01T00:00:00Z',
        },
      ],
      billing_events: [],
      tenant_subscriptions: [],
      tenant: [],
    });
    seedTenant(mock, { billing_state: 'billing_exempt' });

    const { account, stateChange } = await removeExemption(mock, {
      tenant_id: TENANT,
      actor_id: ACTOR,
    });

    assert.equal(account.billing_exempt, false);
    assert.equal(account.exempt_reason, null);
    assert.equal(account.exempt_set_by, null);
    assert.equal(account.exempt_set_at, null);

    assert.equal(mock.db.billing_events.length, 1);
    const event = mock.db.billing_events[0];
    assert.equal(event.event_type, 'tenant.billing_exempt_removed');
    assert.equal(event.actor_id, ACTOR);
    assert.equal(event.payload_json.previous_reason, 'was comp');

    // Without an active subscription, state falls back to active
    assert.equal(stateChange.to, 'active');
  });

  it('rejects when tenant is not currently exempt', async () => {
    const mock = createBillingMock({
      billing_accounts: [{ id: 'ba1', tenant_id: TENANT, billing_exempt: false }],
      billing_events: [],
      tenant: [],
    });
    seedTenant(mock);
    await assert.rejects(
      () => removeExemption(mock, { tenant_id: TENANT, actor_id: ACTOR }),
      /not currently exempt/,
    );
  });

  it('rejects missing actor_id', async () => {
    const mock = createBillingMock({
      billing_accounts: [{ id: 'ba1', tenant_id: TENANT, billing_exempt: true }],
      billing_events: [],
      tenant: [],
    });
    seedTenant(mock);
    await assert.rejects(() => removeExemption(mock, { tenant_id: TENANT }), /actor_id required/);
  });
});
