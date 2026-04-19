-- Migration 155a: Relax and strengthen billing_plans provider price CHECK
--
-- Addresses PR #522 review feedback (codex-connector, copilot-pull-request-reviewer):
--
-- PROBLEM 1 (Codex, P2): The CHECK introduced by migration 155 required
--   provider_price_id_base and provider_price_id_seat to be set together.
--   This conflicts with planResolver.js, which explicitly supports plans
--   without per-seat pricing (seat_unit_amount_cents IS NULL, seat price
--   ID NULL). Adding such a "fixed-seat" plan would fail at the DB layer
--   despite being valid in application code.
--
-- PROBLEM 2 (Copilot, P1): The CHECK did not prevent:
--   (a) provider_price_id_* being set without a provider_product_id
--   (b) provider_price_id_base == provider_price_id_seat (which would
--       make resolvePlanByProviderPriceId throw an ambiguous-match error)
--
-- RESOLUTION:
--   - Base price may exist alone (fixed-seat plan: base set, seat NULL)
--   - Seat price MAY NOT exist without a base (no orphan seat pricing)
--   - If any provider_price_id_* is set, provider_product_id MUST be set
--   - If both base and seat are set, they must be different
--
-- Apply to: dev (efzqxjpfewkrgpdootte) FIRST, then prod (ehjlenywplgyiahgxkfj).
-- No data changes -- existing 4 rows already satisfy the new constraint.

BEGIN;

ALTER TABLE public.billing_plans
    DROP CONSTRAINT IF EXISTS billing_plans_provider_prices_together;

ALTER TABLE public.billing_plans
    ADD CONSTRAINT billing_plans_provider_price_mapping
    CHECK (
        -- Seat price requires a base price (no orphan seat-only pricing)
        (provider_price_id_seat IS NULL OR provider_price_id_base IS NOT NULL)
        -- Any provider_price_id_* requires a provider_product_id
        AND (
            (provider_price_id_base IS NULL AND provider_price_id_seat IS NULL)
            OR provider_product_id IS NOT NULL
        )
        -- Base and seat must differ when both set
        AND (
            provider_price_id_base IS NULL
            OR provider_price_id_seat IS NULL
            OR provider_price_id_base <> provider_price_id_seat
        )
    );

COMMENT ON CONSTRAINT billing_plans_provider_price_mapping ON public.billing_plans IS
    'Ensures Stripe provider mapping is internally consistent: (1) seat price requires base, (2) any price requires a product, (3) base and seat prices must differ when both set. Allows base-only plans (fixed-seat tiers).';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual; uncomment only if reverting)
-- =============================================================================
-- BEGIN;
-- ALTER TABLE public.billing_plans
--     DROP CONSTRAINT IF EXISTS billing_plans_provider_price_mapping;
-- ALTER TABLE public.billing_plans
--     ADD CONSTRAINT billing_plans_provider_prices_together
--     CHECK (
--         (provider_price_id_base IS NULL AND provider_price_id_seat IS NULL)
--         OR (provider_price_id_base IS NOT NULL AND provider_price_id_seat IS NOT NULL)
--     );
-- COMMIT;
