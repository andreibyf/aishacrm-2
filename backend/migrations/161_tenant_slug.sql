-- Migration 161: tenant.slug — URL-safe identifier for white-label public routes
--
-- Purpose: Adds a stable, URL-safe slug per tenant so public-facing routes
--          (the first being the white-label DocuSeal signing page in 4VD-7
--          at /sign/<slug>/<token>) can carry the tenant identity in the
--          URL path without leaking UUIDs and without per-tenant DNS infra.
--
-- Apply order: dev (nrtrjsatmsosslxwlmoj) → staging (bjedfowimuwbcnruwcdj)
--              → prod when 4VD-7 ships.
--
-- Backfill: derived from tenant.name via a lower-case + non-alphanumeric →
--           hyphen + trim transform. If the result is empty or shorter than
--           the CHECK constraint allows (e.g., a tenant named just "!"), the
--           fallback is `tenant-<first-8-of-uuid>`. Collisions are resolved
--           deterministically by appending `-<row_number>` ordered by id.
--
-- Constraints:
--   - NOT NULL (after backfill)
--   - UNIQUE (creates a btree index automatically)
--   - CHECK ^[a-z0-9](-?[a-z0-9])+$ AND length 2..64
--     - lowercase letters and digits only
--     - hyphens only between alphanumerics (no leading/trailing/double hyphen)
--     - min 2 chars (the regex requires at least one alphanumeric+optional-hyphen pair)
--     - max 64 chars (sensible URL ceiling, ample for human-readable names)
--
-- Idempotency: ADD COLUMN IF NOT EXISTS + DO blocks for constraints so the
--              migration is safe to re-apply.

BEGIN;

-- 1. Column (nullable so backfill can write before NOT NULL is enforced)
ALTER TABLE public.tenant ADD COLUMN IF NOT EXISTS slug TEXT;

-- 2. Backfill from name with collision handling
WITH slugified AS (
    SELECT
        id,
        NULLIF(
            TRIM(BOTH '-' FROM REGEXP_REPLACE(LOWER(name), '[^a-z0-9]+', '-', 'g')),
            ''
        ) AS slug_attempt
    FROM public.tenant
    WHERE slug IS NULL
),
finalized AS (
    SELECT
        id,
        CASE
            WHEN slug_attempt IS NULL OR LENGTH(slug_attempt) < 2
                THEN 'tenant-' || SUBSTRING(id::text, 1, 8)
            ELSE LEFT(slug_attempt, 64)
        END AS base_slug
    FROM slugified
),
numbered AS (
    SELECT
        id,
        base_slug,
        ROW_NUMBER() OVER (PARTITION BY base_slug ORDER BY id) AS rn
    FROM finalized
)
UPDATE public.tenant t
SET slug = CASE
    WHEN n.rn = 1 THEN n.base_slug
    ELSE LEFT(n.base_slug, 60) || '-' || n.rn::text  -- LEFT trims to leave room for the suffix
END
FROM numbered n
WHERE t.id = n.id AND t.slug IS NULL;

-- 3. NOT NULL after backfill
ALTER TABLE public.tenant ALTER COLUMN slug SET NOT NULL;

-- 4. UNIQUE constraint (creates btree index automatically)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_slug_unique'
    ) THEN
        ALTER TABLE public.tenant ADD CONSTRAINT tenant_slug_unique UNIQUE (slug);
    END IF;
END$$;

-- 5. Format CHECK
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_slug_format'
    ) THEN
        ALTER TABLE public.tenant ADD CONSTRAINT tenant_slug_format
            CHECK (
                slug ~ '^[a-z0-9](-?[a-z0-9])+$'
                AND LENGTH(slug) BETWEEN 2 AND 64
            );
    END IF;
END$$;

COMMENT ON COLUMN public.tenant.slug IS
    'URL-safe identifier for white-label public routes. Must match ^[a-z0-9](-?[a-z0-9])+$ '
    'and be 2..64 chars. First user is the DocuSeal embedded signing page at '
    '/sign/<slug>/<token> (4VD-7). Generated from tenant.name by default; editable in '
    'tenant settings with uniqueness check.';

COMMIT;

-- =============================================================================
-- ROLLBACK (manual)
-- =============================================================================
-- BEGIN;
-- ALTER TABLE public.tenant DROP CONSTRAINT IF EXISTS tenant_slug_format;
-- ALTER TABLE public.tenant DROP CONSTRAINT IF EXISTS tenant_slug_unique;
-- ALTER TABLE public.tenant DROP COLUMN IF EXISTS slug;
-- COMMIT;
