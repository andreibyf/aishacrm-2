/**
 * Platform Billing -- Invoice Service
 *
 * Create / issue / pay / void invoices and manage line items.
 * All write operations emit billing_events and keep balance math consistent.
 *
 * Exemption guard: invoice creation refuses if the tenant is billing-exempt.
 * This is an application-layer guard (the DB does not enforce it) because
 * exemption is a policy, not a data integrity, concern.
 */

import logger from '../logger.js';
import { logBillingEvent, BILLING_EVENTS } from './billingEventLogger.js';
import { syncTenantBillingState } from './billingStateMachine.js';

const DEFAULT_DUE_DAYS = 14;

/**
 * Generate an invoice number scoped to tenant.
 * Format: INV-<YYYY>-<6-digit sequence>
 * Sequence is derived from count of existing invoices for the tenant this year.
 */
export async function generateInvoiceNumber(supabase, tenantId) {
  if (!tenantId) throw new Error('generateInvoiceNumber: tenantId required');
  const year = new Date().getUTCFullYear();
  const yearStart = new Date(Date.UTC(year, 0, 1)).toISOString();

  const { count, error } = await supabase
    .from('invoices')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .gte('created_at', yearStart);

  if (error) throw new Error(`generateInvoiceNumber: ${error.message}`);

  const seq = String((count || 0) + 1).padStart(6, '0');
  return `INV-${year}-${seq}`;
}

function sumLineItems(items) {
  return items.reduce((s, li) => s + (li.amount_cents ?? li.quantity * li.unit_price_cents), 0);
}

/**
 * Create an invoice in 'draft' status. Does not send it -- use issueInvoice().
 * Refuses if tenant is billing-exempt.
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.tenant_id
 * @param {string|null} [params.subscription_id]
 * @param {Array<{item_type, description, quantity, unit_price_cents}>} params.line_items
 * @param {string} [params.currency='usd']
 * @param {number} [params.due_days=14]
 * @param {number} [params.tax_total_cents=0]
 * @param {string} [params.memo]
 * @param {string|null} [params.actor_id]
 * @param {string} [params.request_id]
 * @returns {Promise<{invoice: object, line_items: Array}>}
 */
export async function createInvoice(supabase, params) {
  const {
    tenant_id,
    subscription_id = null,
    line_items = [],
    currency = 'usd',
    due_days = DEFAULT_DUE_DAYS,
    tax_total_cents = 0,
    memo = null,
    actor_id = null,
    request_id,
  } = params;

  if (!tenant_id) throw new Error('createInvoice: tenant_id required');
  if (!Array.isArray(line_items) || line_items.length === 0) {
    throw new Error('createInvoice: at least one line_item required');
  }

  // Exemption guard
  const { data: account } = await supabase
    .from('billing_accounts')
    .select('billing_exempt')
    .eq('tenant_id', tenant_id)
    .maybeSingle();
  if (account?.billing_exempt === true) {
    throw new Error('createInvoice: tenant is billing-exempt; no invoice created');
  }

  const subtotal = sumLineItems(line_items);
  if (subtotal < 0) throw new Error('createInvoice: subtotal cannot be negative');
  const total = subtotal + tax_total_cents;

  const invoice_number = await generateInvoiceNumber(supabase, tenant_id);
  const due_date = new Date(Date.now() + due_days * 24 * 60 * 60 * 1000).toISOString();

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .insert({
      tenant_id,
      subscription_id,
      invoice_number,
      due_date,
      status: 'draft',
      subtotal_cents: subtotal,
      tax_total_cents,
      total_cents: total,
      balance_due_cents: total,
      currency,
      memo,
    })
    .select('*')
    .single();

  if (invErr) throw new Error(`createInvoice: ${invErr.message}`);

  const lineRows = line_items.map((li) => ({
    invoice_id: invoice.id,
    item_type: li.item_type,
    description: li.description,
    quantity: li.quantity || 1,
    unit_price_cents: li.unit_price_cents,
    amount_cents: li.amount_cents ?? (li.quantity || 1) * li.unit_price_cents,
    metadata: li.metadata || {},
  }));

  const { data: inserted_items, error: liErr } = await supabase
    .from('invoice_line_items')
    .insert(lineRows)
    .select('*');

  if (liErr) {
    // Roll back the invoice on line-item failure
    await supabase.from('invoices').delete().eq('id', invoice.id);
    throw new Error(`createInvoice: line items failed: ${liErr.message}`);
  }

  await logBillingEvent(supabase, {
    tenant_id,
    event_type: BILLING_EVENTS.INVOICE_CREATED,
    source: actor_id ? 'admin' : 'system',
    actor_id,
    payload: {
      invoice_id: invoice.id,
      invoice_number,
      total_cents: total,
      line_item_count: lineRows.length,
    },
    request_id,
  });

  logger.info({ tenant_id, invoice_id: invoice.id, total }, '[Invoices] Created');
  return { invoice, line_items: inserted_items };
}

/**
 * Issue a draft invoice (draft -> open). Emits invoice.sent event.
 */
export async function issueInvoice(supabase, { invoice_id, actor_id, request_id }) {
  if (!invoice_id) throw new Error('issueInvoice: invoice_id required');

  const { data: invoice, error: selErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .single();
  if (selErr || !invoice) throw new Error('issueInvoice: invoice not found');
  if (invoice.status !== 'draft') {
    throw new Error(`issueInvoice: invoice is ${invoice.status}, must be draft`);
  }

  const { data: updated, error: updErr } = await supabase
    .from('invoices')
    .update({ status: 'open' })
    .eq('id', invoice_id)
    .select('*')
    .single();
  if (updErr) throw new Error(`issueInvoice: ${updErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id: invoice.tenant_id,
    event_type: BILLING_EVENTS.INVOICE_SENT,
    source: actor_id ? 'admin' : 'system',
    actor_id: actor_id || null,
    payload: { invoice_id, invoice_number: invoice.invoice_number },
    request_id,
  });

  return updated;
}

/**
 * Record a payment against an invoice. Creates the payments row,
 * updates invoice amount_paid/balance_due/status, emits events.
 *
 * Idempotent on provider_payment_intent_id: if one already exists, returns it.
 *
 * @param {object} supabase
 * @param {object} params
 * @param {string} params.invoice_id
 * @param {number} params.amount_cents
 * @param {string} [params.provider_payment_intent_id]
 * @param {string} [params.provider_charge_id]
 * @param {string} [params.payment_method_type]
 * @param {string} [params.receipt_url]
 * @param {string} [params.source='system']
 * @param {string|null} [params.actor_id]
 * @param {string} [params.request_id]
 */
export async function recordPayment(supabase, params) {
  const {
    invoice_id,
    amount_cents,
    provider_payment_intent_id,
    provider_charge_id,
    payment_method_type,
    receipt_url,
    source = 'system',
    actor_id = null,
    request_id,
  } = params;

  if (!invoice_id) throw new Error('recordPayment: invoice_id required');
  if (!amount_cents || amount_cents <= 0) {
    throw new Error('recordPayment: amount_cents must be > 0');
  }

  const { data: invoice, error: invErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .single();
  if (invErr || !invoice) throw new Error('recordPayment: invoice not found');
  if (invoice.status === 'void' || invoice.status === 'uncollectible') {
    throw new Error(`recordPayment: invoice is ${invoice.status}`);
  }

  // Idempotency check
  if (provider_payment_intent_id) {
    const { data: existing } = await supabase
      .from('payments')
      .select('*')
      .eq('provider_payment_intent_id', provider_payment_intent_id)
      .maybeSingle();
    if (existing) {
      logger.info(
        { payment_id: existing.id, provider_payment_intent_id },
        '[Invoices] recordPayment idempotent skip',
      );
      return { payment: existing, invoice, idempotent: true };
    }
  }

  const { data: payment, error: payErr } = await supabase
    .from('payments')
    .insert({
      tenant_id: invoice.tenant_id,
      invoice_id,
      amount_cents,
      currency: invoice.currency,
      status: 'succeeded',
      provider_payment_intent_id: provider_payment_intent_id || null,
      provider_charge_id: provider_charge_id || null,
      payment_method_type: payment_method_type || null,
      paid_at: new Date().toISOString(),
      receipt_url: receipt_url || null,
    })
    .select('*')
    .single();

  if (payErr) throw new Error(`recordPayment: ${payErr.message}`);

  const newPaid = invoice.amount_paid_cents + amount_cents;
  const newBalance = invoice.total_cents - newPaid;
  const newStatus = newBalance <= 0 ? 'paid' : invoice.status;

  const { data: updInvoice, error: updErr } = await supabase
    .from('invoices')
    .update({
      amount_paid_cents: newPaid,
      balance_due_cents: Math.max(newBalance, 0),
      status: newStatus,
    })
    .eq('id', invoice_id)
    .select('*')
    .single();
  if (updErr) throw new Error(`recordPayment: invoice update: ${updErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id: invoice.tenant_id,
    event_type: BILLING_EVENTS.PAYMENT_RECEIVED,
    source,
    actor_id,
    payload: {
      invoice_id,
      payment_id: payment.id,
      amount_cents,
      invoice_status_after: newStatus,
    },
    request_id,
  });

  if (newStatus === 'paid') {
    await logBillingEvent(supabase, {
      tenant_id: invoice.tenant_id,
      event_type: BILLING_EVENTS.INVOICE_PAID,
      source,
      actor_id,
      payload: { invoice_id, invoice_number: invoice.invoice_number },
      request_id,
    });
    // Payment may clear suspension state; re-sync
    await syncTenantBillingState(supabase, invoice.tenant_id);
  }

  return { payment, invoice: updInvoice, idempotent: false };
}

/**
 * Void an invoice. Only valid for non-paid invoices. Clears balance_due.
 */
export async function voidInvoice(supabase, { invoice_id, actor_id, request_id, reason }) {
  if (!invoice_id) throw new Error('voidInvoice: invoice_id required');
  if (!actor_id) throw new Error('voidInvoice: actor_id required');

  const { data: invoice, error: selErr } = await supabase
    .from('invoices')
    .select('*')
    .eq('id', invoice_id)
    .single();
  if (selErr || !invoice) throw new Error('voidInvoice: invoice not found');
  if (invoice.status === 'paid') throw new Error('voidInvoice: cannot void a paid invoice');
  if (invoice.status === 'void') return invoice; // idempotent

  const { data: voided, error: updErr } = await supabase
    .from('invoices')
    .update({ status: 'void', balance_due_cents: 0 })
    .eq('id', invoice_id)
    .select('*')
    .single();
  if (updErr) throw new Error(`voidInvoice: ${updErr.message}`);

  await logBillingEvent(supabase, {
    tenant_id: invoice.tenant_id,
    event_type: BILLING_EVENTS.INVOICE_VOIDED,
    source: 'admin',
    actor_id,
    payload: {
      invoice_id,
      invoice_number: invoice.invoice_number,
      reason: reason || null,
    },
    request_id,
  });

  return voided;
}

/**
 * Fetch a tenant's invoices ordered by issue_date DESC.
 */
export async function listInvoices(supabase, tenantId, { status, limit = 50 } = {}) {
  if (!tenantId) throw new Error('listInvoices: tenantId required');
  let q = supabase
    .from('invoices')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('issue_date', { ascending: false })
    .limit(limit);
  if (status) q = q.eq('status', status);
  const { data, error } = await q;
  if (error) throw new Error(`listInvoices: ${error.message}`);
  return data || [];
}

export default {
  generateInvoiceNumber,
  createInvoice,
  issueInvoice,
  recordPayment,
  voidInvoice,
  listInvoices,
};
