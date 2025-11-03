-- Fix RLS state after re-enabling RLS manually: ensure apikey has RLS enabled
-- and systembranding has at least one service_role policy.

-- Ensure RLS is enabled on apikey (safe if already enabled)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'apikey'
  ) THEN
    EXECUTE 'ALTER TABLE public.apikey ENABLE ROW LEVEL SECURITY';
  END IF;
END $$;

-- Optional: tighten grants (no public access)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'apikey'
  ) THEN
    EXECUTE 'REVOKE ALL ON public.apikey FROM PUBLIC, anon, authenticated';
  END IF;
END $$;

-- Ensure systembranding is RLS-enabled and not fully blocked by missing policies
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'systembranding'
  ) THEN
    -- Enable RLS (safe if already enabled)
    EXECUTE 'ALTER TABLE public.systembranding ENABLE ROW LEVEL SECURITY';

    -- Revoke broad access; backend uses service_role
    EXECUTE 'REVOKE ALL ON public.systembranding FROM PUBLIC, anon, authenticated';

    -- Create a service_role full-access policy if it does not exist
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE schemaname = 'public' 
        AND tablename = 'systembranding' 
        AND policyname = 'Service role full access to systembranding'
    ) THEN
      EXECUTE format('CREATE POLICY %I ON public.systembranding FOR ALL TO service_role USING (true) WITH CHECK (true)',
                     'Service role full access to systembranding');
    END IF;
  END IF;
END $$;
