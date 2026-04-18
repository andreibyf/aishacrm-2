/**
 * Platform Billing -- Event Logger
 *
 * Append-only writer for the `billing_events` table.
 * Enforces the canonical event type vocabulary at the application layer
 * (the DB column is free-form TEXT to allow forward compatibility).
 *
 * Usage:
 *   import { logBillingEvent, BILLING_EVENTS } from './billingEventLogger.js';
 *   await logBillingEvent(supabase, {
 *     tenant_id, event_type: BILLING_EVENTS.INVOICE_CREATED,
 *     source: 'system', payload: { invoice_id },
 *   });
 */

import logger from '../logger.js';

export const BILLING_EVENTS = Object.freeze({
  // Invoice lifecycle
  INVOICE_CREATED: 'invoice.created',
  INVOICE_SENT: 'invoice.sent',
  INVOICE_PAST_DUE: 'invoice.past_due',
  INVOICE_PAID: 'invoice.paid',
  INVOICE_VOIDED: 'invoice.voided',

  // Payment lifecycle
  PAYMENT_RECEIVED: 'payment.received',
  PAYMENT_FAILED: 'payment.failed',
  PAYMENT_REFUNDED: 'payment.refunded',

  // Subscription lifecycle
  SUBSCRIPTION_CREATED: 'subscription.created',
  SUBSCRIPTION_CANCELED: 'subscription.canceled',
  SUBSCRIPTION_RENEWED: 'subscription.renewed',

  // Tenant state
  TENANT_SUSPENSION_WARNING: 'tenant.suspension_warning',
  TENANT_SUSPENDED: 'tenant.suspended',
  TENANT_UNSUSPENDED: 'tenant.unsuspended',
  TENANT_BILLING_EXEMPT_SET: 'tenant.billing_exempt_set',
  TENANT_BILLING_EXEMPT_REMOVED: 'tenant.billing_exempt_removed',

  // Plan management
  PLAN_ASSIGNED: 'plan.assigned',
  PLAN_CHANGED: 'plan.changed',
});

export const VALID_EVENT_TYPES = new Set(Object.values(BILLING_EVENTS));
export const VALID_SOURCES = new Set(['system', 'admin', 'webhook', 'api']);

/**
 * Log a billing event. Append-only; throws on invalid input.
 *
 * @param {object} supabase - service-role client
 * @param {object} params
 * @param {string|null} params.tenant_id - nullable for platform-wide events
 * @param {string} params.event_type - must be in BILLING_EVENTS
 * @param {string} params.source - must be in VALID_SOURCES
 * @param {string|null} [params.actor_id] - users.id for admin/api sources
 * @param {object} [params.payload] - JSONB payload
 * @param {string|null} [params.request_id]
 * @returns {Promise<object>} inserted row
 */
export async function logBillingEvent(supabase, params) {
  const { tenant_id, event_type, source, actor_id, payload, request_id } = params;

  if (!event_type || typeof event_type !== 'string') {
    throw new Error('logBillingEvent: event_type is required (string)');
  }
  if (!VALID_EVENT_TYPES.has(event_type)) {
    throw new Error(
      `logBillingEvent: unknown event_type "${event_type}". ` +
        `Valid: ${[...VALID_EVENT_TYPES].join(', ')}`,
    );
  }
  if (!source || !VALID_SOURCES.has(source)) {
    throw new Error(`logBillingEvent: source must be one of ${[...VALID_SOURCES].join(', ')}`);
  }
  if ((source === 'admin' || source === 'api') && !actor_id) {
    throw new Error(`logBillingEvent: actor_id required when source="${source}"`);
  }

  const row = {
    tenant_id: tenant_id || null,
    event_type,
    source,
    actor_id: actor_id || null,
    payload_json: payload || {},
    request_id: request_id || null,
  };

  const { data, error } = await supabase.from('billing_events').insert(row).select('*').single();

  if (error) {
    logger.error({ err: error, event_type, tenant_id }, '[BillingEvents] Insert failed');
    throw new Error(`logBillingEvent: ${error.message}`);
  }

  return data;
}

export default { BILLING_EVENTS, VALID_EVENT_TYPES, VALID_SOURCES, logBillingEvent };
