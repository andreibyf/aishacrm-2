/**
 * Platform Billing -- Configuration Loader
 *
 * Loads platform-level Stripe credentials from Doppler/env.
 *
 * IMPORTANT: These are AiSHA's OWN Stripe keys for platform billing
 * (tenant <- AiSHA). They are distinct from tenant_integrations.stripe,
 * which holds PER-TENANT Stripe keys used for Cal.com session purchases
 * (client <- tenant).
 *
 * Required Doppler secrets (prd_prd + dev_dev):
 *   - STRIPE_PLATFORM_SECRET_KEY       (sk_live_... or sk_test_...)
 *   - STRIPE_PLATFORM_WEBHOOK_SECRET   (whsec_...)
 *
 * Optional:
 *   - STRIPE_PLATFORM_API_VERSION      (default: 2024-06-20)
 *   - PLATFORM_BILLING_CURRENCY        (default: usd)
 */

const API_VERSION_DEFAULT = '2024-06-20';
const CURRENCY_DEFAULT = 'usd';

export function getPlatformBillingConfig() {
  const secretKey = process.env.STRIPE_PLATFORM_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_PLATFORM_WEBHOOK_SECRET;

  return {
    stripeSecretKey: secretKey || null,
    stripeWebhookSecret: webhookSecret || null,
    stripeApiVersion: process.env.STRIPE_PLATFORM_API_VERSION || API_VERSION_DEFAULT,
    defaultCurrency: process.env.PLATFORM_BILLING_CURRENCY || CURRENCY_DEFAULT,
    isConfigured: Boolean(secretKey && webhookSecret),
  };
}

/**
 * Throws if platform billing is not configured. Use in code paths that
 * absolutely need a live Stripe connection (checkout creation, webhook verify).
 */
export function requirePlatformBillingConfig() {
  const cfg = getPlatformBillingConfig();
  if (!cfg.isConfigured) {
    throw new Error(
      'Platform billing not configured: STRIPE_PLATFORM_SECRET_KEY and STRIPE_PLATFORM_WEBHOOK_SECRET must be set in Doppler',
    );
  }
  return cfg;
}

export default { getPlatformBillingConfig, requirePlatformBillingConfig };
