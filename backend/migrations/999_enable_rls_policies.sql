-- Legacy migration placeholder (idempotent no-op)
-- Policies and RLS are managed by earlier migrations (022, 023, 028).
-- This file intentionally performs no changes to avoid noisy reruns.

DO $$
BEGIN
  RAISE NOTICE '999_enable_rls_policies: no-op (RLS managed by prior migrations)';
END $$;
