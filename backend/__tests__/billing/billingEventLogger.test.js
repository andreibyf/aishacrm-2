/**
 * Unit tests for backend/lib/billing/billingEventLogger.js
 *
 * Covers input validation. The actual DB insert is mocked with a minimal
 * supabase stub that records the call and returns a synthetic row.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  BILLING_EVENTS,
  VALID_EVENT_TYPES,
  VALID_SOURCES,
  logBillingEvent,
} from '../../lib/billing/billingEventLogger.js';

// ─── Minimal mock supabase for insert().select().single() chain ─────────────

function mockSupabase({ insertResult = null, insertError = null } = {}) {
  const calls = [];
  return {
    calls,
    from(table) {
      return {
        insert(row) {
          calls.push({ op: 'insert', table, row });
          return {
            select() {
              return {
                single: async () => ({
                  data: insertResult || { id: 'evt-1', ...row },
                  error: insertError,
                }),
              };
            },
          };
        },
      };
    },
  };
}

describe('billingEventLogger -- BILLING_EVENTS constants', () => {
  it('exports all 18 canonical event types', () => {
    // 5 invoice + 3 payment + 3 subscription + 5 tenant + 2 plan = 18
    assert.equal(VALID_EVENT_TYPES.size, 18);
  });

  it('all event types are dotted namespace.action form', () => {
    for (const t of VALID_EVENT_TYPES) {
      assert.match(t, /^[a-z_]+\.[a-z_]+$/, `bad format: ${t}`);
    }
  });

  it('BILLING_EVENTS is frozen', () => {
    assert.throws(() => {
      BILLING_EVENTS.NEW_EVENT = 'foo.bar';
    }, /read only|Cannot (add|assign)/);
  });

  it('VALID_SOURCES is the 4 canonical sources', () => {
    assert.deepEqual([...VALID_SOURCES].sort(), ['admin', 'api', 'system', 'webhook']);
  });
});

describe('billingEventLogger -- logBillingEvent validation', () => {
  const sb = mockSupabase();

  it('rejects missing event_type', async () => {
    await assert.rejects(
      () => logBillingEvent(sb, { tenant_id: 't1', source: 'system' }),
      /event_type is required/,
    );
  });

  it('rejects unknown event_type', async () => {
    await assert.rejects(
      () =>
        logBillingEvent(sb, {
          tenant_id: 't1',
          event_type: 'invoice.totally_made_up',
          source: 'system',
        }),
      /unknown event_type/,
    );
  });

  it('rejects invalid source', async () => {
    await assert.rejects(
      () =>
        logBillingEvent(sb, {
          tenant_id: 't1',
          event_type: BILLING_EVENTS.INVOICE_CREATED,
          source: 'alien',
        }),
      /source must be one of/,
    );
  });
});

describe('billingEventLogger -- actor requirement', () => {
  it('source=admin requires actor_id', async () => {
    const sb = mockSupabase();
    await assert.rejects(
      () =>
        logBillingEvent(sb, {
          tenant_id: 't1',
          event_type: BILLING_EVENTS.TENANT_BILLING_EXEMPT_SET,
          source: 'admin',
        }),
      /actor_id required/,
    );
  });

  it('source=api requires actor_id', async () => {
    const sb = mockSupabase();
    await assert.rejects(
      () =>
        logBillingEvent(sb, {
          tenant_id: 't1',
          event_type: BILLING_EVENTS.PLAN_ASSIGNED,
          source: 'api',
        }),
      /actor_id required/,
    );
  });

  it('source=system allows no actor_id', async () => {
    const sb = mockSupabase();
    const result = await logBillingEvent(sb, {
      tenant_id: 't1',
      event_type: BILLING_EVENTS.INVOICE_CREATED,
      source: 'system',
    });
    assert.ok(result, 'should insert successfully');
    assert.equal(sb.calls.length, 1);
    assert.equal(sb.calls[0].row.actor_id, null);
  });

  it('source=webhook allows no actor_id', async () => {
    const sb = mockSupabase();
    await logBillingEvent(sb, {
      tenant_id: 't1',
      event_type: BILLING_EVENTS.PAYMENT_RECEIVED,
      source: 'webhook',
    });
    assert.equal(sb.calls[0].row.actor_id, null);
  });
});

describe('billingEventLogger -- payload and normalization', () => {
  it('passes tenant_id, event_type, source through', async () => {
    const sb = mockSupabase();
    await logBillingEvent(sb, {
      tenant_id: 't-abc',
      event_type: BILLING_EVENTS.INVOICE_PAID,
      source: 'webhook',
      payload: { invoice_id: 'inv-1' },
    });
    const row = sb.calls[0].row;
    assert.equal(row.tenant_id, 't-abc');
    assert.equal(row.event_type, 'invoice.paid');
    assert.equal(row.source, 'webhook');
    assert.deepEqual(row.payload_json, { invoice_id: 'inv-1' });
  });

  it('defaults missing payload to empty object', async () => {
    const sb = mockSupabase();
    await logBillingEvent(sb, {
      tenant_id: 't1',
      event_type: BILLING_EVENTS.INVOICE_VOIDED,
      source: 'admin',
      actor_id: 'u1',
    });
    assert.deepEqual(sb.calls[0].row.payload_json, {});
  });

  it('accepts null tenant_id (platform-wide event)', async () => {
    const sb = mockSupabase();
    await logBillingEvent(sb, {
      tenant_id: null,
      event_type: BILLING_EVENTS.PLAN_CHANGED,
      source: 'system',
    });
    assert.equal(sb.calls[0].row.tenant_id, null);
  });

  it('surfaces DB insert errors', async () => {
    const sb = mockSupabase({ insertError: { message: 'constraint violation' } });
    await assert.rejects(
      () =>
        logBillingEvent(sb, {
          tenant_id: 't1',
          event_type: BILLING_EVENTS.INVOICE_CREATED,
          source: 'system',
        }),
      /constraint violation/,
    );
  });
});
