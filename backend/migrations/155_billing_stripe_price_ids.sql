-- Migration 155: Platform Billing -- Stripe Price IDs + Seat Pricing + Enterprise Tier
--
-- Purpose: Extend billing_plans to store Stripe provider Price IDs, per-seat
--          pricing, and included seat counts. Backfills the 3 existing plans
--          with new 2026 prices and adds the Enterprise tier.
--
-- Impact: ADDITIVE to billing_plans schema (4 new nullable columns).
--         MUTATES seeded rows (updates amount_cents, seat_limit for the
--         existing starter/growth/pro plans; inserts enterprise_monthly).
--
-- Prereqs:
--   - Migration 154 applied.
--   - Stripe products/prices already created in the Stripe sandbox by
--     scripts/stripe/setup_subscription_tiers.py (see stripe_tier_ids.json).
--   - Production Stripe price IDs will be filled in via a follow-up
--     migration (155b) after the same script is re-run against the live
--     Stripe account. This migration only seeds the sandbox IDs; prod IDs
--     land as UPDATE statements later.
--
-- Apply to: dev (efzqxjpfewkrgpdootte) FIRST, then prod (ehjlenywplgyiahgxkfj).
--
-- Rollback: Columns are nullable; DROP COLUMN is safe. See rollback block
--           at the bottom (commented -- do not run unless intentionally
--           reverting).

BEGIN;

-- =============================================================================
-- Schema additions on billing_plans
-- =============================================================================

-- Stripe Product ID for this plan (one product per tier; one product has two
-- prices attached: base + per-seat).
ALTER TABLE public.billing_plans
    ADD COLUMN IF NOT EXISTS provider_product_id TEXT;

-- Stripe Price ID for the flat base price (includes N seats). Used as the
-- primary line item on Stripe subscriptions for this plan.
ALTER TABLE public.billing_plans
    ADD COLUMN IF NOT EXISTS provider_price_id_base TEXT;

-- Stripe Price ID for the per-additional-seat price. Used as a second line
-- item on Stripe subscriptions when quantity > included_seats.
ALTER TABLE public.billing_plans
    ADD COLUMN IF NOT EXISTS provider_price_id_seat TEXT;

-- How many seats are included in the flat base price. For seat > included,
-- the backend bills (quantity - included_seats) * seat_unit_amount_cents.
-- NOT NULL once backfilled; default 0 for safety on new inserts.
ALTER TABLE public.billing_plans
    ADD COLUMN IF NOT EXISTS included_seats INTEGER NOT NULL DEFAULT 0
    CHECK (included_seats >= 0);

-- Unit price (cents) charged per seat beyond included_seats. Nullable for
-- plans that do not support additional seats.
ALTER TABLE public.billing_plans
    ADD COLUMN IF NOT EXISTS seat_unit_amount_cents INTEGER
    CHECK (seat_unit_amount_cents IS NULL OR seat_unit_amount_cents >= 0);

-- Trial period in days. Stored on the plan so the checkout handler can apply
-- it uniformly at Stripe Checkout Session creation time. 0 = no trial.
ALTER TABLE public.billing_plans
    ADD COLUMN IF NOT EXISTS trial_days INTEGER NOT NULL DEFAULT 0
    CHECK (trial_days >= 0);

COMMENT ON COLUMN public.billing_plans.provider_product_id IS
    'Stripe Product ID (prod_...). Sandbox and prod Stripe accounts have different IDs; updated per-environment.';
COMMENT ON COLUMN public.billing_plans.provider_price_id_base IS
    'Stripe Price ID (price_...) for the flat base fee line item. Includes included_seats seats.';
COMMENT ON COLUMN public.billing_plans.provider_price_id_seat IS
    'Stripe Price ID (price_...) for the per-additional-seat line item.';
COMMENT ON COLUMN public.billing_plans.included_seats IS
    'Number of seats included in the flat base price before per-seat billing kicks in.';
COMMENT ON COLUMN public.billing_plans.seat_unit_amount_cents IS
    'Unit price (cents) per seat beyond included_seats. Must match the Stripe Price unit_amount for provider_price_id_seat.';
COMMENT ON COLUMN public.billing_plans.trial_days IS
    'Free trial length in days applied at subscription creation. 0 = no trial.';


-- Ensure both provider price IDs come from the same product, when all are set.
-- (Cross-column check implemented as trigger rather than CHECK because it
-- references three columns and requires subquery semantics.)
-- For now we enforce a weaker invariant via a CHECK:
--   if provider_price_id_base IS NULL xor provider_price_id_seat IS NULL, reject
ALTER TABLE public.billing_plans
    DROP CONSTRAINT IF EXISTS billing_plans_provider_prices_together;
ALTER TABLE public.billing_plans
    ADD CONSTRAINT billing_plans_provider_prices_together
    CHECK (
        (provider_price_id_base IS NULL AND provider_price_id_seat IS NULL)
        OR (provider_price_id_base IS NOT NULL AND provider_price_id_seat IS NOT NULL)
    );

-- Unique lookup on provider_price_id_base so webhook handlers can resolve
-- a Stripe Price -> billing_plans row in O(1).
CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plans_provider_price_id_base
    ON public.billing_plans (provider_price_id_base)
    WHERE provider_price_id_base IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_plans_provider_price_id_seat
    ON public.billing_plans (provider_price_id_seat)
    WHERE provider_price_id_seat IS NOT NULL;

-- =============================================================================
-- Row updates: align existing plans to new 2026 pricing
-- =============================================================================
-- Old prices (Migration 154 defaults):
--   starter_monthly: $49   growth_monthly: $149   pro_monthly: $299
-- New prices (this migration):
--   starter_monthly: $199  growth_monthly: $297   pro_monthly: $497

UPDATE public.billing_plans
   SET amount_cents = 19900,
       included_seats = 3,
       seat_unit_amount_cents = 4900,
       trial_days = 14,
       description = 'CRM core + AiSHA AI assistant (web). Includes 3 users.',
       updated_at = NOW()
 WHERE code = 'starter_monthly';

UPDATE public.billing_plans
   SET amount_cents = 29700,
       included_seats = 5,
       seat_unit_amount_cents = 4900,
       trial_days = 14,
       description = 'Starter + WhatsApp AiSHA + BRAID workflows + AI campaigns. Includes 5 users.',
       updated_at = NOW()
 WHERE code = 'growth_monthly';

UPDATE public.billing_plans
   SET amount_cents = 49700,
       included_seats = 10,
       seat_unit_amount_cents = 4900,
       trial_days = 14,
       description = 'Growth + AI email drafting + CARE Autonomy + Cal.com + multi-team visibility. Includes 10 users.',
       updated_at = NOW()
 WHERE code = 'pro_monthly';


-- =============================================================================
-- Insert Enterprise tier
-- =============================================================================

INSERT INTO public.billing_plans (
    code, name, description, billing_interval, amount_cents, currency,
    is_active, included_seats, seat_unit_amount_cents, trial_days
) VALUES (
    'enterprise_monthly',
    'Enterprise',
    'All Pro features + priority AI + priority support. Includes 25 users.',
    'month',
    99700,
    'usd',
    true,
    25,
    4900,
    14
)
ON CONFLICT (code) DO UPDATE SET
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    billing_interval = EXCLUDED.billing_interval,
    amount_cents = EXCLUDED.amount_cents,
    currency = EXCLUDED.currency,
    is_active = EXCLUDED.is_active,
    included_seats = EXCLUDED.included_seats,
    seat_unit_amount_cents = EXCLUDED.seat_unit_amount_cents,
    trial_days = EXCLUDED.trial_days,
    updated_at = NOW();

-- =============================================================================
-- Seed Stripe SANDBOX price IDs
-- =============================================================================
-- These IDs come from scripts/stripe/stripe_tier_ids.json produced by
-- scripts/stripe/setup_subscription_tiers.py on 2026-04-19 against the
-- aishacrm `dev_personal` Doppler config (Stripe sandbox account).
--
-- PROD NOTE: When applying this migration to prod Supabase, re-run the
-- Stripe setup script against the LIVE Stripe account, capture its price
-- IDs, and update these UPDATE statements accordingly (or follow up with
-- migration 155b). Sandbox IDs MUST NOT be used against live Stripe.

UPDATE public.billing_plans
   SET provider_product_id    = 'prod_UMnbvKeEfs21xl',
       provider_price_id_base = 'price_1TO3zwRgJI7U9gSkwp42oMqJ',
       provider_price_id_seat = 'price_1TO3zwRgJI7U9gSkjFtnnifa',
       updated_at = NOW()
 WHERE code = 'starter_monthly';

UPDATE public.billing_plans
   SET provider_product_id    = 'prod_UMnb8UUqfz7pQR',
       provider_price_id_base = 'price_1TO3zxRgJI7U9gSkIjvTR0t1',
       provider_price_id_seat = 'price_1TO3zyRgJI7U9gSkvol8NS7J',
       updated_at = NOW()
 WHERE code = 'growth_monthly';

UPDATE public.billing_plans
   SET provider_product_id    = 'prod_UMnbpD8Agd9p1i',
       provider_price_id_base = 'price_1TO3zzRgJI7U9gSkpi4pZ4F5',
       provider_price_id_seat = 'price_1TO400RgJI7U9gSkzEIvjMir',
       updated_at = NOW()
 WHERE code = 'pro_monthly';

UPDATE public.billing_plans
   SET provider_product_id    = 'prod_UMnbpVfBSahh2L',
       provider_price_id_base = 'price_1TO401RgJI7U9gSkFyIgKBCm',
       provider_price_id_seat = 'price_1TO401RgJI7U9gSkwqlJzcmN',
       updated_at = NOW()
 WHERE code = 'enterprise_monthly';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual; uncomment only if reverting)
-- =============================================================================
-- BEGIN;
-- DELETE FROM public.billing_plans WHERE code = 'enterprise_monthly';
-- ALTER TABLE public.billing_plans
--     DROP CONSTRAINT IF EXISTS billing_plans_provider_prices_together;
-- DROP INDEX IF EXISTS idx_billing_plans_provider_price_id_base;
-- DROP INDEX IF EXISTS idx_billing_plans_provider_price_id_seat;
-- ALTER TABLE public.billing_plans
--     DROP COLUMN IF EXISTS trial_days,
--     DROP COLUMN IF EXISTS seat_unit_amount_cents,
--     DROP COLUMN IF EXISTS included_seats,
--     DROP COLUMN IF EXISTS provider_price_id_seat,
--     DROP COLUMN IF EXISTS provider_price_id_base,
--     DROP COLUMN IF EXISTS provider_product_id;
-- -- Restore old prices:
-- UPDATE public.billing_plans SET amount_cents = 4900  WHERE code = 'starter_monthly';
-- UPDATE public.billing_plans SET amount_cents = 14900 WHERE code = 'growth_monthly';
-- UPDATE public.billing_plans SET amount_cents = 29900 WHERE code = 'pro_monthly';
-- COMMIT;
