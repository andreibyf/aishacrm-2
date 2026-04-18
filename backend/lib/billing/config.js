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
    isConfigured: Boolean(secretKey),
  };
}

/**
 * Throws if platform billing is not configured. Accepts options to specify
 * which secrets are required for the current operation.
 *
 * @param {object} [options]
 * @param {boolean} [options.requireWebhookSecret=false] - Also require webhook secret (for webhook handlers)
 */
export function requirePlatformBillingConfig(options = {}) {
  const { requireWebhookSecret = false } = options;
  const cfg = getPlatformBillingConfig();
  const missing = [];

  if (!cfg.stripeSecretKey) missing.push('STRIPE_PLATFORM_SECRET_KEY');
  if (requireWebhookSecret && !cfg.stripeWebhookSecret)
    missing.push('STRIPE_PLATFORM_WEBHOOK_SECRET');

  if (missing.length > 0) {
    throw new Error(
      `Platform billing not configured: ${missing.join(' and ')} must be set in Doppler`,
    );
  }
  return cfg;
}

export default { getPlatformBillingConfig, requirePlatformBillingConfig };
