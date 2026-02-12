-- Fix pg_cron malformed statements causing "SELECT select" syntax errors
-- This was consuming connections and causing statement timeouts

-- Update cron job command to use proper capitalization
-- pg_cron executes commands as-is, the lowercase "select" was being wrapped
UPDATE cron.job
SET command = 'SELECT public.refresh_dashboard_funnel_counts()'
WHERE jobname IN (
  'refresh_dashboard_funnel_counts_nightly',
  'refresh_dashboard_funnel_counts_main_nightly'
)
AND command LIKE '%select public.refresh_dashboard_funnel_counts%';

-- Verify the fix
DO $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM cron.job
  WHERE jobname IN (
    'refresh_dashboard_funnel_counts_nightly',
    'refresh_dashboard_funnel_counts_main_nightly'
  )
  AND command LIKE '%select %'; -- lowercase select still present
  
  IF v_count > 0 THEN
    RAISE WARNING 'Still found % cron jobs with lowercase select', v_count;
  ELSE
    RAISE NOTICE 'Successfully fixed cron job commands';
  END IF;
END $$;
