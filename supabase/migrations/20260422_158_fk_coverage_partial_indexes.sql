-- Migration: 158_fk_coverage_partial_indexes
-- Applied to DEV + PROD on 2026-04-22.
-- On both environments, accounts.assigned_to and activities.assigned_to are
-- covered by a compound (tenant_id, assigned_to) index, which does NOT satisfy
-- Postgres's FK RI lookup (equality on assigned_to alone scans the compound).
-- Add dedicated single-column partial indexes for FK coverage.

CREATE INDEX IF NOT EXISTS idx_accounts_assigned_to_fk   ON public.accounts(assigned_to)   WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to_fk ON public.activities(assigned_to) WHERE assigned_to IS NOT NULL;
