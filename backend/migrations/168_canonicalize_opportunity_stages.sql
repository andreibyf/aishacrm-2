-- ============================================================================
-- Migration 168 — Canonicalize legacy opportunity.stage values (4VD-63)
-- ============================================================================
--
-- Why
-- ---
-- backend/config/constants.js declares the canonical opportunity stages:
--   prospecting, qualification, proposal, negotiation, closed_won, closed_lost
--
-- The React OpportunityForm component historically wrote the legacy short
-- forms `won` and `lost` directly to opportunities.stage. The Kanban board,
-- the stat cards and every server-side filter use the canonical
-- `closed_won` / `closed_lost`, so legacy rows were invisible whenever the
-- UI applied a "Closed Won" filter — the bug reported in 4VD-63.
--
-- The accompanying route changes accept either spelling at read time (via
-- backend/lib/opportunityStageNormalizer.js) and canonicalize on every
-- write. This migration is the one-off cleanup that makes the data match
-- the canonical contract going forward.
--
-- Safety
-- ------
-- - No DDL — pure UPDATE on a single varchar column.
-- - RLS / multi-tenant boundaries are unaffected; the WHERE clause only
--   selects rows by their `stage` value.
-- - Idempotent: re-running is a no-op once all legacy rows are converted.
-- - Reversible via a manual UPDATE if needed (not provided as a script —
--   reverting would re-introduce the original bug).
--
-- Post-apply
-- ----------
-- Run `NOTIFY pgrst, 'reload schema'` if the deployment uses PostgREST
-- caching (see CLAUDE.md migration runbook). No schema reload is strictly
-- required here since we did not alter any column definitions, but the
-- notify is cheap and keeps the runbook consistent.
-- ============================================================================

BEGIN;

-- Pre-flight: surface how many rows will be touched, scoped per tenant.
-- The DO block logs counts rather than asserting so the migration is
-- safe to apply against a clean prod (zero legacy rows expected).
DO $$
DECLARE
  legacy_won_count   INTEGER;
  legacy_lost_count  INTEGER;
BEGIN
  SELECT COUNT(*) INTO legacy_won_count FROM opportunities WHERE stage = 'won';
  SELECT COUNT(*) INTO legacy_lost_count FROM opportunities WHERE stage = 'lost';
  RAISE NOTICE '[4VD-63] Legacy rows to canonicalize: won=%, lost=%',
    legacy_won_count, legacy_lost_count;
END $$;

-- Canonicalize legacy short forms to the constants.STATUS.OPPORTUNITY values.
UPDATE opportunities
   SET stage = 'closed_won',
       updated_at = COALESCE(updated_at, now())
 WHERE stage = 'won';

UPDATE opportunities
   SET stage = 'closed_lost',
       updated_at = COALESCE(updated_at, now())
 WHERE stage = 'lost';

-- Defensive sweep for the odd casing variant seen in dashboard helpers
-- (see src/components/dashboard/TopAccounts.jsx). Harmless if absent.
UPDATE opportunities
   SET stage = 'closed_won',
       updated_at = COALESCE(updated_at, now())
 WHERE stage = 'closedwon';

UPDATE opportunities
   SET stage = 'closed_lost',
       updated_at = COALESCE(updated_at, now())
 WHERE stage = 'closedlost';

-- Post-condition assertion: no legacy rows remain.
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
    FROM opportunities
   WHERE stage IN ('won', 'lost', 'closedwon', 'closedlost');
  IF remaining <> 0 THEN
    RAISE EXCEPTION '[4VD-63] migration 168 left % legacy stage rows behind', remaining;
  END IF;
END $$;

COMMIT;

-- PostgREST schema reload (no-op if not used).
NOTIFY pgrst, 'reload schema';
