-- 183_growth_insights_claimed_at.sql
--
-- OSINT Opportunity Intelligence (Phase 1 / Task 8) — worker claim marker.
--
-- growth_insights rows are inserted with status='running' by the client-triggered
-- POST /insights route. The background poll-worker (growthInsightWorker) must claim
-- a row ATOMICALLY so two pollers never process the same run. We claim by flipping
-- claimed_at from NULL → now() in a conditional UPDATE
-- (`.update({claimed_at}).eq('id', id).is('claimed_at', null)`): Postgres serializes
-- the two updates and only the one that observed NULL gets a returned row.
--
-- Orphan note: a row claimed by a worker that crashes mid-run stays status='running'
-- with claimed_at set. A future reaper (claimed_at older than N minutes → reset) can
-- recover these; out of scope for Phase 1.
--
-- Apply order (Supabase MCP apply_migration): dev branch (nrtrjsatmsosslxwlmoj) →
-- staging (bjedfowimuwbcnruwcdj) → prod (ehjlenywplgyiahgxkfj).

ALTER TABLE public.growth_insights
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- Partial index: the worker scans for unclaimed running rows.
CREATE INDEX IF NOT EXISTS idx_growth_insights_unclaimed
  ON public.growth_insights (created_at)
  WHERE status = 'running' AND claimed_at IS NULL;
