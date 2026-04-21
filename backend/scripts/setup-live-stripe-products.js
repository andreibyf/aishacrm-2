/**
 * Platform Billing — LIVE Stripe Products + Prices setup
 *
 * Creates (or reuses) the Stripe Products and Prices that correspond to
 * AiSHA platform subscription plans in public.billing_plans. Outputs SQL
 * UPDATE statements that backfill provider_product_id, provider_price_id_base,
 * and provider_price_id_seat on each plan row so that the checkout session
 * route can reference real live-mode Stripe objects.
 *
 * Why this exists: the DB was seeded with test-mode price IDs
 * (price_1TO3…) that do not exist in live Stripe. Adding live keys
 * (sk_live_…) to Doppler prd_prd is not enough on its own — we also need
 * live-mode Product/Price objects AND the DB pointers to them.
 *
 * Usage (dry-run -- no Stripe writes, just prints what would happen):
 *   doppler run --project aishacrm --config prd_prd -- node backend/scripts/setup-live-stripe-products.js --dry-run
 *
 * Usage (live -- creates objects in Stripe, writes SQL to stdout):
 *   doppler run --project aishacrm --config prd_prd -- node backend/scripts/setup-live-stripe-products.js
 *
 * Idempotency: products and prices are looked up via metadata.plan_code
 * (for products) and metadata.plan_code + metadata.price_kind (for prices)
 * before creation. Re-running after a full success is a no-op.
 *
 * Safety guards:
 *   - Refuses to run unless the key is sk_live_ (this script is
 *     deliberately live-only; for sandbox use the earlier seeded data)
 *   - Refuses to run if STRIPE_PLATFORM_SECRET_KEY is missing
 *   - Dry-run mode prints plan → Stripe actions without calling Stripe
 *
 * Exit codes:
 *   0 — success, SQL emitted
 *   1 — configuration or Stripe error
 */

import Stripe from 'stripe';

const DRY_RUN = process.argv.includes('--dry-run');

// Authoritative plan definitions. Amounts are cents. Source of truth for
// this script -- NOT read from the DB, because we want to be explicit
// about what we're billing customers in live mode. If these disagree
// with the DB after the script runs, the follow-up UPDATE statements
// bring the DB in line.
const PLANS = [
  {
    code: 'starter_monthly',
    name: 'Starter',
    description: 'CRM core + AiSHA AI assistant (web). Includes 3 users.',
    base_amount_cents: 19900,
    seat_amount_cents: 4900,
    included_seats: 3,
    trial_days: 14,
  },
  {
    code: 'growth_monthly',
    name: 'Growth',
    description: 'Starter + WhatsApp AiSHA + BRAID workflows + AI campaigns. Includes 5 users.',
    base_amount_cents: 29700,
    seat_amount_cents: 4900,
    included_seats: 5,
    trial_days: 14,
  },
  {
    code: 'pro_monthly',
    name: 'Pro',
    description:
      'Growth + AI email drafting + CARE Autonomy + Cal.com + multi-team visibility. Includes 10 users.',
    base_amount_cents: 49700,
    seat_amount_cents: 4900,
    included_seats: 10,
    trial_days: 14,
  },
  {
    code: 'enterprise_monthly',
    name: 'Enterprise',
    description: 'All Pro features + priority AI + priority support. Includes 25 users.',
    base_amount_cents: 99700,
    seat_amount_cents: 4900,
    included_seats: 25,
    trial_days: 14,
  },
];

function exitWith(code, msg) {
  console.error(msg);
  process.exit(code);
}

function log(msg) {
  // Stderr so stdout stays clean for the SQL block
  console.error(msg);
}

async function findProductByPlanCode(stripe, planCode) {
  // search API on metadata. Stripe docs note the search index is eventually
  // consistent; we retry the list API as a fallback for recently-created
  // objects (so re-runs right after a first run still find them).
  try {
    const result = await stripe.products.search({
      query: `metadata['plan_code']:'${planCode}' AND active:'true'`,
      limit: 1,
    });
    if (result.data.length > 0) return result.data[0];
  } catch (err) {
    log(`  warn: products.search failed (${err.message}); falling back to list`);
  }

  // Fallback: list + filter. Bounded to 100 which is more than enough for 4 plans.
  const list = await stripe.products.list({ active: true, limit: 100 });
  return list.data.find((p) => p.metadata?.plan_code === planCode) || null;
}

async function findPriceByKind(stripe, productId, planCode, kind) {
  // Prices aren't searchable by metadata, so list active prices on the
  // product and filter client-side.
  const list = await stripe.prices.list({ product: productId, active: true, limit: 100 });
  return (
    list.data.find((p) => p.metadata?.plan_code === planCode && p.metadata?.price_kind === kind) ||
    null
  );
}

async function ensureProduct(stripe, plan) {
  const existing = await findProductByPlanCode(stripe, plan.code);
  if (existing) {
    log(`  product: reuse ${existing.id} (${plan.code})`);
    return existing;
  }
  if (DRY_RUN) {
    log(`  product: DRY-RUN would create name='${plan.name}' metadata.plan_code=${plan.code}`);
    return { id: `prod_DRYRUN_${plan.code}`, __dryRun: true };
  }
  const product = await stripe.products.create({
    name: `AiSHA ${plan.name}`,
    description: plan.description,
    metadata: {
      plan_code: plan.code,
      managed_by: 'setup-live-stripe-products',
    },
  });
  log(`  product: created ${product.id} (${plan.code})`);
  return product;
}

async function ensurePrice(stripe, product, plan, kind) {
  const existing = product.__dryRun
    ? null
    : await findPriceByKind(stripe, product.id, plan.code, kind);
  if (existing) {
    log(`  price[${kind}]: reuse ${existing.id}`);
    return existing;
  }
  const amount = kind === 'base' ? plan.base_amount_cents : plan.seat_amount_cents;
  const nickname =
    kind === 'base'
      ? `${plan.name} — base (incl. ${plan.included_seats} seats)`
      : `${plan.name} — per-seat overage`;

  if (DRY_RUN) {
    log(
      `  price[${kind}]: DRY-RUN would create unit_amount=${amount} recurring=month nickname='${nickname}'`,
    );
    return { id: `price_DRYRUN_${plan.code}_${kind}`, __dryRun: true };
  }

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: 'usd',
    recurring: { interval: 'month' },
    nickname,
    metadata: {
      plan_code: plan.code,
      price_kind: kind, // 'base' | 'seat'
      managed_by: 'setup-live-stripe-products',
    },
  });
  log(`  price[${kind}]: created ${price.id} (amount=${amount})`);
  return price;
}

async function main() {
  const key = process.env.STRIPE_PLATFORM_SECRET_KEY;
  if (!key) exitWith(1, 'STRIPE_PLATFORM_SECRET_KEY missing. Run via `doppler run --`.');
  if (!key.startsWith('sk_live_')) {
    exitWith(
      1,
      `STRIPE_PLATFORM_SECRET_KEY is not a live-mode key (expected prefix: sk_live_). This script is live-only.`,
    );
  }

  const stripe = new Stripe(key, { apiVersion: process.env.STRIPE_API_VERSION || '2024-06-20' });

  log(`[setup-live-stripe-products] Mode: ${DRY_RUN ? 'DRY-RUN' : 'LIVE'}`);
  log(`[setup-live-stripe-products] Plans: ${PLANS.length}`);
  log('');

  const results = [];
  for (const plan of PLANS) {
    log(`Plan: ${plan.code}`);
    const product = await ensureProduct(stripe, plan);
    const basePrice = await ensurePrice(stripe, product, plan, 'base');
    const seatPrice = await ensurePrice(stripe, product, plan, 'seat');
    results.push({ plan, product, basePrice, seatPrice });
    log('');
  }

  // Emit SQL to stdout. Apply to dev (efzqxjpfewkrgpdootte) and prod
  // (ehjlenywplgyiahgxkfj) -- but typically only prod since this is live
  // Stripe. Dev keeps its test-mode IDs.
  console.log('-- =================================================================');
  console.log('-- Apply ONLY to prod Supabase: ehjlenywplgyiahgxkfj');
  console.log('-- Dev (efzqxjpfewkrgpdootte) keeps its test-mode IDs from sandbox.');
  console.log('-- Generated: ' + new Date().toISOString());
  console.log('-- =================================================================');
  console.log('BEGIN;');
  for (const r of results) {
    console.log(`-- ${r.plan.code} (${r.plan.name})`);
    console.log(`UPDATE public.billing_plans SET`);
    console.log(`  provider_product_id    = '${r.product.id}',`);
    console.log(`  provider_price_id_base = '${r.basePrice.id}',`);
    console.log(`  provider_price_id_seat = '${r.seatPrice.id}',`);
    console.log(`  updated_at             = now()`);
    console.log(`WHERE code = '${r.plan.code}';`);
    console.log('');
  }
  console.log('COMMIT;');

  log('[setup-live-stripe-products] Done. SQL emitted to stdout.');
}

main().catch((err) => {
  console.error('FATAL:', err.message);
  if (err.raw) console.error('Stripe error raw:', JSON.stringify(err.raw, null, 2));
  process.exit(1);
});
