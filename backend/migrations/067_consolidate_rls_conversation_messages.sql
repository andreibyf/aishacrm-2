-- Migration: Consolidate RLS policies for conversation_messages table
-- Rationale: Replace multiple auth calls with (SELECT auth.*()) subquery
-- to avoid initplan overhead and improve query performance.
-- Schema note: conversation_messages only has id (UUID), no tenant_id column
-- Will need to join through conversations table for tenant isolation

DO $$
BEGIN
  -- SELECT policy - join to conversations for tenant check
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversation_messages' 
      AND policyname='conversation_messages_all_consolidated_select'
  ) THEN
    CREATE POLICY conversation_messages_all_consolidated_select
      ON public.conversation_messages
      FOR SELECT
      TO authenticated
      USING (
        -- Check via parent conversation
        EXISTS (
          SELECT 1 FROM conversations c 
          WHERE c.id = conversation_messages.conversation_id 
            AND c.tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        )
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- INSERT policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversation_messages' 
      AND policyname='conversation_messages_all_consolidated_insert'
  ) THEN
    CREATE POLICY conversation_messages_all_consolidated_insert
      ON public.conversation_messages
      FOR INSERT
      TO authenticated
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM conversations c 
          WHERE c.id = conversation_messages.conversation_id 
            AND c.tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        )
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- UPDATE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversation_messages' 
      AND policyname='conversation_messages_all_consolidated_update'
  ) THEN
    CREATE POLICY conversation_messages_all_consolidated_update
      ON public.conversation_messages
      FOR UPDATE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM conversations c 
          WHERE c.id = conversation_messages.conversation_id 
            AND c.tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        )
        OR (SELECT auth.role()) = 'service_role'
      )
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM conversations c 
          WHERE c.id = conversation_messages.conversation_id 
            AND c.tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        )
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;

  -- DELETE policy
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname='public' 
      AND tablename='conversation_messages' 
      AND policyname='conversation_messages_all_consolidated_delete'
  ) THEN
    CREATE POLICY conversation_messages_all_consolidated_delete
      ON public.conversation_messages
      FOR DELETE
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM conversations c 
          WHERE c.id = conversation_messages.conversation_id 
            AND c.tenant_id = (SELECT uuid((auth.jwt() ->> 'tenant_id')))
        )
        OR (SELECT auth.role()) = 'service_role'
      );
  END IF;
END$$;
