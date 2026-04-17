/**
 * Platform Billing -- Payment Provider Interface
 *
 * Abstract contract every provider adapter must honor. This exists so
 * the billing service can stay provider-agnostic (Phase 1 ships Stripe;
 * Phase 6 may add others).
 *
 * Every method takes plain objects and returns plain objects.
 * Adapters are responsible for mapping provider-specific fields into
 * this normalized shape.
 *
 * NOTE: This file is intentionally a specification, not a class.
 * Adapters are plain objects exposing these function names.
 */

/**
 * Contract documentation (typedef-style):
 *
 *   createCustomer({ billing_email, company_name, metadata }) ->
 *     Promise<{ id: string }>
 *
 *   createCheckoutSession({ customer_id, amount_cents, currency,
 *                           description, success_url, cancel_url,
 *                           metadata }) ->
 *     Promise<{ id: string, url: string }>
 *
 *   createPortalSession({ customer_id, return_url }) ->
 *     Promise<{ url: string }>
 *
 *   verifyWebhookSignature({ rawBody, signature }) ->
 *     { event: object }   // throws on invalid signature
 *
 *   normalizePaymentEvent(event) ->
 *     { type: string, tenant_id: string|null, amount_cents: number|null,
 *       currency: string|null, payment_intent_id: string|null,
 *       charge_id: string|null, metadata: object }
 */

/**
 * Assert that a given object implements the provider interface.
 * Useful in tests and at startup.
 * @param {object} adapter
 * @throws {Error} if any required method is missing
 */
export function assertProviderInterface(adapter) {
  const required = [
    'createCustomer',
    'createCheckoutSession',
    'createPortalSession',
    'verifyWebhookSignature',
    'normalizePaymentEvent',
  ];
  const missing = required.filter((m) => typeof adapter?.[m] !== 'function');
  if (missing.length) {
    throw new Error(`Payment provider missing methods: ${missing.join(', ')}`);
  }
}

export default { assertProviderInterface };
