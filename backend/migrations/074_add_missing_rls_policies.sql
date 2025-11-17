-- Migration: Add RLS policies for tables with RLS enabled but no policies
-- Rationale: Tables with RLS enabled but no policies effectively deny all access
-- Add minimal tenant isolation policies with service_role bypass

-- 1. ai_campaigns (TEXT tenant_id)
DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='ai_campaigns' 
      AND policyname='ai_campaigns_all_consolidated_select'
  ) THEN
    CREATE POLICY ai_campaigns_all_consolidated_select
      ON public.ai_campaigns
      FOR SELECT
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='ai_campaigns' 
      AND policyname='ai_campaigns_all_consolidated_insert'
  ) THEN
    CREATE POLICY ai_campaigns_all_consolidated_insert
      ON public.ai_campaigns
      FOR INSERT
      TO authenticated
      WITH CHECK (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='ai_campaigns' 
      AND policyname='ai_campaigns_all_consolidated_update'
  ) THEN
    CREATE POLICY ai_campaigns_all_consolidated_update
      ON public.ai_campaigns
      FOR UPDATE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      )
      WITH CHECK (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='ai_campaigns' 
      AND policyname='ai_campaigns_all_consolidated_delete'
  ) THEN
    CREATE POLICY ai_campaigns_all_consolidated_delete
      ON public.ai_campaigns
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT auth.jwt() ->> 'tenant_id')
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;

-- 2. conversations (UUID tenant_id) - Note: Previously handled in migration 055
-- Recreate if missing
DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_all_consolidated_select'
  ) THEN
    CREATE POLICY conversations_all_consolidated_select
      ON public.conversations
      FOR SELECT
      TO authenticated
      USING (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_all_consolidated_insert'
  ) THEN
    CREATE POLICY conversations_all_consolidated_insert
      ON public.conversations
      FOR INSERT
      TO authenticated
      WITH CHECK (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_all_consolidated_update'
  ) THEN
    CREATE POLICY conversations_all_consolidated_update
      ON public.conversations
      FOR UPDATE
      TO authenticated
      USING (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      )
      WITH CHECK (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversations' 
      AND policyname='conversations_all_consolidated_delete'
  ) THEN
    CREATE POLICY conversations_all_consolidated_delete
      ON public.conversations
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;

-- 3. entity_transitions (UUID tenant_id)
DO $$
BEGIN
  -- SELECT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='entity_transitions' 
      AND policyname='entity_transitions_all_consolidated_select'
  ) THEN
    CREATE POLICY entity_transitions_all_consolidated_select
      ON public.entity_transitions
      FOR SELECT
      TO authenticated
      USING (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='entity_transitions' 
      AND policyname='entity_transitions_all_consolidated_insert'
  ) THEN
    CREATE POLICY entity_transitions_all_consolidated_insert
      ON public.entity_transitions
      FOR INSERT
      TO authenticated
      WITH CHECK (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='entity_transitions' 
      AND policyname='entity_transitions_all_consolidated_update'
  ) THEN
    CREATE POLICY entity_transitions_all_consolidated_update
      ON public.entity_transitions
      FOR UPDATE
      TO authenticated
      USING (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      )
      WITH CHECK (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='entity_transitions' 
      AND policyname='entity_transitions_all_consolidated_delete'
  ) THEN
    CREATE POLICY entity_transitions_all_consolidated_delete
      ON public.entity_transitions
      FOR DELETE
      TO authenticated
      USING (
        tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;

-- 4. system_settings (no tenant_id - global config, service_role only)
DO $$
BEGIN
  -- SELECT policy for service_role
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='system_settings' 
      AND policyname='system_settings_service_role_select'
  ) THEN
    CREATE POLICY system_settings_service_role_select
      ON public.system_settings
      FOR SELECT
      TO authenticated
      USING ((SELECT auth.role()) = 'service_role');
  END IF;

  -- ALL operations policy for service_role
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='system_settings' 
      AND policyname='system_settings_service_role_modify'
  ) THEN
    CREATE POLICY system_settings_service_role_modify
      ON public.system_settings
      FOR ALL
      TO authenticated
      USING ((SELECT auth.role()) = 'service_role')
      WITH CHECK ((SELECT auth.role()) = 'service_role');
  END IF;
END$$;

-- Note: All policies use consolidated pattern with (SELECT auth.*()) subquery
-- and service_role bypass for consistency with migrations 055-068
