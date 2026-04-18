/**
 * Unit tests for backend/lib/billing/invoiceService.js
 *
 * Covers:
 *   - Exemption guard on createInvoice
 *   - Line item sum + balance math
 *   - Invoice number generation format
 *   - recordPayment idempotency on provider_payment_intent_id
 *   - voidInvoice rules (cannot void paid; idempotent on void->void)
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createBillingMock } from './_billingMock.js';
import {
  generateInvoiceNumber,
  createInvoice,
  issueInvoice,
  recordPayment,
  voidInvoice,
} from '../../lib/billing/invoiceService.js';

const TENANT = 'tenant-bbb';
const ACTOR = 'user-admin-2';

function fresh() {
  return createBillingMock({
    billing_accounts: [],
    invoices: [],
    invoice_line_items: [],
    payments: [],
    billing_events: [],
    tenant: [{ id: TENANT, billing_state: 'active' }],
    tenant_subscriptions: [],
  });
}

describe('invoiceService -- generateInvoiceNumber', () => {
  it('produces INV-<YYYY>-000001 for the first invoice of the year', async () => {
    const mock = fresh();
    const n = await generateInvoiceNumber(mock, TENANT);
    const year = new Date().getUTCFullYear();
    assert.equal(n, `INV-${year}-000001`);
  });

  it('increments sequence per tenant', async () => {
    const mock = fresh();
    const year = new Date().getUTCFullYear();
    mock.db.invoices = [
      {
        id: '1',
        tenant_id: TENANT,
        created_at: `${year}-01-05T00:00:00Z`,
        invoice_number: `INV-${year}-000001`,
      },
      {
        id: '2',
        tenant_id: TENANT,
        created_at: `${year}-02-10T00:00:00Z`,
        invoice_number: `INV-${year}-000002`,
      },
    ];
    const n = await generateInvoiceNumber(mock, TENANT);
    assert.equal(n, `INV-${year}-000003`);
  });

  it('throws without tenantId', async () => {
    const mock = fresh();
    await assert.rejects(() => generateInvoiceNumber(mock, null), /tenantId required/);
  });
});

describe('invoiceService -- createInvoice exemption guard', () => {
  it('REFUSES to create invoice when tenant is billing_exempt', async () => {
    const mock = fresh();
    mock.db.billing_accounts = [
      {
        id: 'ba',
        tenant_id: TENANT,
        billing_exempt: true,
        exempt_reason: 'comp',
        exempt_set_by: ACTOR,
        exempt_set_at: new Date().toISOString(),
      },
    ];

    await assert.rejects(
      () =>
        createInvoice(mock, {
          tenant_id: TENANT,
          line_items: [
            {
              item_type: 'subscription',
              description: 'Starter',
              quantity: 1,
              unit_price_cents: 4900,
            },
          ],
        }),
      /billing-exempt/,
    );
    assert.equal(mock.db.invoices.length, 0, 'no invoice should be created');
  });

  it('allows creation when exempt=false', async () => {
    const mock = fresh();
    mock.db.billing_accounts = [{ id: 'ba', tenant_id: TENANT, billing_exempt: false }];

    const { invoice, line_items } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'Starter', quantity: 1, unit_price_cents: 4900 },
      ],
    });

    assert.equal(invoice.status, 'draft');
    assert.equal(invoice.total_cents, 4900);
    assert.equal(line_items.length, 1);
  });

  it('allows creation when no billing_account exists (new tenant)', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    assert.ok(invoice);
  });
});

describe('invoiceService -- balance math', () => {
  it('subtotal = sum of amount_cents; total = subtotal + tax', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      tax_total_cents: 500,
      line_items: [
        { item_type: 'subscription', description: 'Base', quantity: 1, unit_price_cents: 4900 },
        { item_type: 'setup_fee', description: 'Onboarding', quantity: 1, unit_price_cents: 10000 },
      ],
    });
    assert.equal(invoice.subtotal_cents, 14900);
    assert.equal(invoice.tax_total_cents, 500);
    assert.equal(invoice.total_cents, 15400);
    assert.equal(invoice.balance_due_cents, 15400);
  });

  it('logs INVOICE_CREATED event', async () => {
    const mock = fresh();
    await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    const event = mock.db.billing_events.find((e) => e.event_type === 'invoice.created');
    assert.ok(event, 'invoice.created event must be logged');
    assert.equal(event.source, 'system');
  });

  it('rejects empty line_items', async () => {
    const mock = fresh();
    await assert.rejects(
      () => createInvoice(mock, { tenant_id: TENANT, line_items: [] }),
      /at least one line_item/,
    );
  });
});

describe('invoiceService -- recordPayment', () => {
  async function seedInvoice(mock, total = 10000) {
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: total },
      ],
    });
    await issueInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR });
    return invoice;
  }

  it('full payment sets status=paid, balance_due=0, logs PAYMENT_RECEIVED + INVOICE_PAID', async () => {
    const mock = fresh();
    const invoice = await seedInvoice(mock, 10000);

    const {
      payment,
      invoice: updated,
      idempotent,
    } = await recordPayment(mock, {
      invoice_id: invoice.id,
      amount_cents: 10000,
      provider_payment_intent_id: 'pi_abc',
      source: 'webhook',
    });

    assert.equal(idempotent, false);
    assert.equal(payment.amount_cents, 10000);
    assert.equal(updated.status, 'paid');
    assert.equal(updated.amount_paid_cents, 10000);
    assert.equal(updated.balance_due_cents, 0);

    const types = mock.db.billing_events.map((e) => e.event_type);
    assert.ok(types.includes('payment.received'));
    assert.ok(types.includes('invoice.paid'));
  });

  it('partial payment keeps invoice status=open, tracks balance', async () => {
    const mock = fresh();
    const invoice = await seedInvoice(mock, 10000);

    const { invoice: updated } = await recordPayment(mock, {
      invoice_id: invoice.id,
      amount_cents: 3000,
      provider_payment_intent_id: 'pi_partial',
      source: 'webhook',
    });

    assert.equal(updated.status, 'open');
    assert.equal(updated.amount_paid_cents, 3000);
    assert.equal(updated.balance_due_cents, 7000);

    const types = mock.db.billing_events.map((e) => e.event_type);
    assert.ok(types.includes('payment.received'));
    assert.ok(!types.includes('invoice.paid'), 'invoice.paid should NOT fire on partial');
  });
});

describe('invoiceService -- recordPayment idempotency', () => {
  it('returns existing payment when provider_payment_intent_id already recorded', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 5000 },
      ],
    });
    await issueInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR });

    const first = await recordPayment(mock, {
      invoice_id: invoice.id,
      amount_cents: 5000,
      provider_payment_intent_id: 'pi_dup_check',
      source: 'webhook',
    });
    assert.equal(first.idempotent, false);

    const second = await recordPayment(mock, {
      invoice_id: invoice.id,
      amount_cents: 5000,
      provider_payment_intent_id: 'pi_dup_check',
      source: 'webhook',
    });
    assert.equal(second.idempotent, true);
    assert.equal(second.payment.id, first.payment.id);

    // Exactly one payment row, exactly one invoice.paid event
    assert.equal(mock.db.payments.length, 1);
    const paidEvents = mock.db.billing_events.filter((e) => e.event_type === 'invoice.paid');
    assert.equal(paidEvents.length, 1);
  });

  it('rejects amount_cents <= 0', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    await assert.rejects(
      () => recordPayment(mock, { invoice_id: invoice.id, amount_cents: 0 }),
      /amount_cents must be > 0/,
    );
  });

  it('rejects payment on voided invoice', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    await voidInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR, reason: 'test' });
    await assert.rejects(
      () => recordPayment(mock, { invoice_id: invoice.id, amount_cents: 100 }),
      /invoice is void/,
    );
  });
});

describe('invoiceService -- voidInvoice', () => {
  it('voids a draft invoice; zeroes balance_due; logs INVOICE_VOIDED', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    const voided = await voidInvoice(mock, {
      invoice_id: invoice.id,
      actor_id: ACTOR,
      reason: 'customer request',
    });
    assert.equal(voided.status, 'void');
    assert.equal(voided.balance_due_cents, 0);
    const ev = mock.db.billing_events.find((e) => e.event_type === 'invoice.voided');
    assert.equal(ev.payload_json.reason, 'customer request');
  });

  it('refuses to void a paid invoice', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    await issueInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR });
    await recordPayment(mock, {
      invoice_id: invoice.id,
      amount_cents: 100,
      provider_payment_intent_id: 'pi_v',
    });
    await assert.rejects(
      () => voidInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR }),
      /cannot void a paid invoice/,
    );
  });

  it('is idempotent on already-voided invoice', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    await voidInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR });
    const again = await voidInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR });
    assert.equal(again.status, 'void');
  });

  it('requires actor_id', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', quantity: 1, unit_price_cents: 100 },
      ],
    });
    await assert.rejects(() => voidInvoice(mock, { invoice_id: invoice.id }), /actor_id required/);
  });
});

describe('invoiceService -- sumLineItems NaN safety (PR #517 issue 6)', () => {
  it('does NOT produce NaN when amount_cents and quantity are both missing', async () => {
    const mock = fresh();
    // Line item missing BOTH amount_cents and quantity -- previously this
    // reduced to `undefined * N` => NaN propagating into subtotal/total.
    // Fixed behaviour: treat missing quantity as 1.
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [{ item_type: 'subscription', description: 'S', unit_price_cents: 4900 }],
    });
    assert.equal(invoice.subtotal_cents, 4900);
    assert.equal(invoice.total_cents, 4900);
    assert.ok(!Number.isNaN(invoice.subtotal_cents), 'subtotal must not be NaN');
  });

  it('treats missing unit_price_cents as 0 (no NaN propagation)', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        { item_type: 'subscription', description: 'S', unit_price_cents: 500 },
        { item_type: 'adjustment', description: 'Free item', quantity: 2 },
      ],
    });
    // 500 + (2 * 0) == 500
    assert.equal(invoice.subtotal_cents, 500);
  });

  it('prefers explicit amount_cents over quantity*unit_price_cents', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [
        {
          item_type: 'adjustment',
          description: 'Override',
          quantity: 10,
          unit_price_cents: 999,
          amount_cents: 1234,
        },
      ],
    });
    assert.equal(invoice.subtotal_cents, 1234);
  });
});

describe('invoiceService -- BillingError propagation (PR #517 issue 4)', () => {
  it('throws BillingError with code=INVALID_INPUT on missing tenant_id', async () => {
    const mock = fresh();
    const { BillingError, BILLING_ERROR_CODES } = await import('../../lib/billing/errors.js');
    await assert.rejects(
      () =>
        createInvoice(mock, {
          line_items: [{ item_type: 's', description: 'x', quantity: 1, unit_price_cents: 1 }],
        }),
      (err) =>
        err instanceof BillingError &&
        err.statusCode === 400 &&
        err.code === BILLING_ERROR_CODES.INVALID_INPUT,
    );
  });

  it('throws BillingError with code=EXEMPT when tenant is billing-exempt', async () => {
    const mock = fresh();
    mock.db.billing_accounts = [
      {
        id: 'ba',
        tenant_id: TENANT,
        billing_exempt: true,
        exempt_reason: 'pilot',
        exempt_set_by: 'u',
        exempt_set_at: new Date().toISOString(),
      },
    ];
    const { BillingError, BILLING_ERROR_CODES } = await import('../../lib/billing/errors.js');
    await assert.rejects(
      () =>
        createInvoice(mock, {
          tenant_id: TENANT,
          line_items: [{ item_type: 's', description: 'x', quantity: 1, unit_price_cents: 1 }],
        }),
      (err) =>
        err instanceof BillingError &&
        err.statusCode === 409 &&
        err.code === BILLING_ERROR_CODES.EXEMPT,
    );
  });

  it('throws BillingError with code=NOT_FOUND when voiding a missing invoice', async () => {
    const mock = fresh();
    const { BillingError, BILLING_ERROR_CODES } = await import('../../lib/billing/errors.js');
    await assert.rejects(
      () =>
        voidInvoice(mock, {
          invoice_id: '00000000-0000-0000-0000-000000000000',
          actor_id: ACTOR,
        }),
      (err) =>
        err instanceof BillingError &&
        err.statusCode === 404 &&
        err.code === BILLING_ERROR_CODES.NOT_FOUND,
    );
  });

  it('throws BillingError with code=INVOICE_PAID when voiding a paid invoice', async () => {
    const mock = fresh();
    const { invoice } = await createInvoice(mock, {
      tenant_id: TENANT,
      line_items: [{ item_type: 's', description: 'x', quantity: 1, unit_price_cents: 100 }],
    });
    await issueInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR });
    await recordPayment(mock, {
      invoice_id: invoice.id,
      amount_cents: 100,
      provider_payment_intent_id: 'pi_paid',
    });
    const { BillingError, BILLING_ERROR_CODES } = await import('../../lib/billing/errors.js');
    await assert.rejects(
      () => voidInvoice(mock, { invoice_id: invoice.id, actor_id: ACTOR }),
      (err) =>
        err instanceof BillingError &&
        err.statusCode === 400 &&
        err.code === BILLING_ERROR_CODES.INVOICE_PAID,
    );
  });
});
