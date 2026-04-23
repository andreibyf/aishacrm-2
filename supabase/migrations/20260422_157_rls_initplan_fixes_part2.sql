-- Migration: 156_rls_initplan_fixes (part 2 of 2 — JWT / current_setting / consolidation)
-- Applied to DEV + PROD on 2026-04-22.
-- Uses canonical ((SELECT auth.jwt()) ->> 'key') wrapping — parens placement is critical;
-- Supabase linter does NOT recognize (SELECT auth.jwt() ->> 'key') as init-plan-optimized.
-- Also consolidates two multiple_permissive_policies findings.

BEGIN;

-- communications_* (JWT tenant_id)
DROP POLICY IF EXISTS communications_threads_tenant_isolation ON public.communications_threads;
CREATE POLICY communications_threads_tenant_isolation ON public.communications_threads FOR ALL TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid)
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid);

DROP POLICY IF EXISTS communications_messages_tenant_isolation ON public.communications_messages;
CREATE POLICY communications_messages_tenant_isolation ON public.communications_messages FOR ALL TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid)
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid);

DROP POLICY IF EXISTS communications_entity_links_tenant_isolation ON public.communications_entity_links;
CREATE POLICY communications_entity_links_tenant_isolation ON public.communications_entity_links FOR ALL TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid)
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid);

DROP POLICY IF EXISTS communications_lead_capture_queue_tenant_isolation ON public.communications_lead_capture_queue;
CREATE POLICY communications_lead_capture_queue_tenant_isolation ON public.communications_lead_capture_queue FOR ALL TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid)
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid);

-- customer_care_state + history
DROP POLICY IF EXISTS customer_care_state_tenant_select ON public.customer_care_state;
CREATE POLICY customer_care_state_tenant_select ON public.customer_care_state FOR SELECT TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid);

DROP POLICY IF EXISTS customer_care_state_history_tenant_select ON public.customer_care_state_history;
CREATE POLICY customer_care_state_history_tenant_select ON public.customer_care_state_history FOR SELECT TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid);

-- care_playbook jwt app_metadata
DROP POLICY IF EXISTS care_playbook_authenticated_select ON public.care_playbook;
CREATE POLICY care_playbook_authenticated_select ON public.care_playbook FOR SELECT TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'))::uuid);

DROP POLICY IF EXISTS care_playbook_execution_authenticated_select ON public.care_playbook_execution;
CREATE POLICY care_playbook_execution_authenticated_select ON public.care_playbook_execution FOR SELECT TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) -> 'app_metadata' ->> 'tenant_id'))::uuid);

-- billing tables (current_setting)
DROP POLICY IF EXISTS billing_accounts_tenant_read ON public.billing_accounts;
CREATE POLICY billing_accounts_tenant_read ON public.billing_accounts FOR SELECT TO public
  USING (tenant_id = ((SELECT current_setting('app.current_tenant_id', true)))::uuid);

DROP POLICY IF EXISTS tenant_subscriptions_tenant_read ON public.tenant_subscriptions;
CREATE POLICY tenant_subscriptions_tenant_read ON public.tenant_subscriptions FOR SELECT TO public
  USING (tenant_id = ((SELECT current_setting('app.current_tenant_id', true)))::uuid);

DROP POLICY IF EXISTS invoices_tenant_read ON public.invoices;
CREATE POLICY invoices_tenant_read ON public.invoices FOR SELECT TO public
  USING (tenant_id = ((SELECT current_setting('app.current_tenant_id', true)))::uuid);

DROP POLICY IF EXISTS invoice_line_items_tenant_read ON public.invoice_line_items;
CREATE POLICY invoice_line_items_tenant_read ON public.invoice_line_items FOR SELECT TO public
  USING (invoice_id IN (SELECT i.id FROM public.invoices i WHERE i.tenant_id = ((SELECT current_setting('app.current_tenant_id', true)))::uuid));

DROP POLICY IF EXISTS payments_tenant_read ON public.payments;
CREATE POLICY payments_tenant_read ON public.payments FOR SELECT TO public
  USING (tenant_id = ((SELECT current_setting('app.current_tenant_id', true)))::uuid);

DROP POLICY IF EXISTS billing_events_tenant_read ON public.billing_events;
CREATE POLICY billing_events_tenant_read ON public.billing_events FOR SELECT TO public
  USING (tenant_id = ((SELECT current_setting('app.current_tenant_id', true)))::uuid);

-- templates
DROP POLICY IF EXISTS templates_select ON public.templates;
DROP POLICY IF EXISTS templates_insert ON public.templates;
DROP POLICY IF EXISTS templates_update ON public.templates;
DROP POLICY IF EXISTS templates_delete ON public.templates;
CREATE POLICY templates_select ON public.templates FOR SELECT TO public
  USING ((tenant_id)::text = (SELECT current_setting('app.tenant_id', true)));
CREATE POLICY templates_insert ON public.templates FOR INSERT TO public
  WITH CHECK ((tenant_id)::text = (SELECT current_setting('app.tenant_id', true)));
CREATE POLICY templates_update ON public.templates FOR UPDATE TO public
  USING ((tenant_id)::text = (SELECT current_setting('app.tenant_id', true)))
  WITH CHECK ((tenant_id)::text = (SELECT current_setting('app.tenant_id', true)));
CREATE POLICY templates_delete ON public.templates FOR DELETE TO public
  USING ((tenant_id)::text = (SELECT current_setting('app.tenant_id', true)));

-- users_tenant_update
DROP POLICY IF EXISTS users_tenant_update ON public.users;
CREATE POLICY users_tenant_update ON public.users FOR UPDATE TO public
  USING (
    (EXISTS (SELECT 1 FROM public.users caller WHERE caller.id = (SELECT auth.uid()) AND (caller.role)::text = 'superadmin'))
    OR (tenant_id = current_tenant_id() AND (id = (SELECT auth.uid()) OR EXISTS (
      SELECT 1 FROM public.users caller
      WHERE caller.id = (SELECT auth.uid())
        AND caller.tenant_id = current_tenant_id()
        AND (caller.perm_settings = true OR (caller.role)::text = ANY (ARRAY['owner','admin']))
    )))
  )
  WITH CHECK (
    (EXISTS (SELECT 1 FROM public.users caller WHERE caller.id = (SELECT auth.uid()) AND (caller.role)::text = 'superadmin'))
    OR tenant_id = current_tenant_id()
  );

-- conversations
DROP POLICY IF EXISTS conversations_all_consolidated_select ON public.conversations;
DROP POLICY IF EXISTS conversations_all_consolidated_insert ON public.conversations;
DROP POLICY IF EXISTS conversations_all_consolidated_update ON public.conversations;
DROP POLICY IF EXISTS conversations_all_consolidated_delete ON public.conversations;
CREATE POLICY conversations_all_consolidated_select ON public.conversations FOR SELECT TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');
CREATE POLICY conversations_all_consolidated_insert ON public.conversations FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');
CREATE POLICY conversations_all_consolidated_update ON public.conversations FOR UPDATE TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role')
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');
CREATE POLICY conversations_all_consolidated_delete ON public.conversations FOR DELETE TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');

-- conversation_messages (with EXISTS subquery to conversations)
DROP POLICY IF EXISTS conversation_messages_all_consolidated_select ON public.conversation_messages;
DROP POLICY IF EXISTS conversation_messages_all_consolidated_insert ON public.conversation_messages;
DROP POLICY IF EXISTS conversation_messages_all_consolidated_update ON public.conversation_messages;
DROP POLICY IF EXISTS conversation_messages_all_consolidated_delete ON public.conversation_messages;
CREATE POLICY conversation_messages_all_consolidated_select ON public.conversation_messages FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_messages.conversation_id AND c.tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid) OR (SELECT auth.role()) = 'service_role');
CREATE POLICY conversation_messages_all_consolidated_insert ON public.conversation_messages FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_messages.conversation_id AND c.tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid) OR (SELECT auth.role()) = 'service_role');
CREATE POLICY conversation_messages_all_consolidated_update ON public.conversation_messages FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_messages.conversation_id AND c.tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid) OR (SELECT auth.role()) = 'service_role')
  WITH CHECK (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_messages.conversation_id AND c.tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid) OR (SELECT auth.role()) = 'service_role');
CREATE POLICY conversation_messages_all_consolidated_delete ON public.conversation_messages FOR DELETE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.conversations c WHERE c.id = conversation_messages.conversation_id AND c.tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid) OR (SELECT auth.role()) = 'service_role');

-- entity_transitions
DROP POLICY IF EXISTS entity_transitions_all_consolidated_select ON public.entity_transitions;
DROP POLICY IF EXISTS entity_transitions_all_consolidated_insert ON public.entity_transitions;
DROP POLICY IF EXISTS entity_transitions_all_consolidated_update ON public.entity_transitions;
DROP POLICY IF EXISTS entity_transitions_all_consolidated_delete ON public.entity_transitions;
CREATE POLICY entity_transitions_all_consolidated_select ON public.entity_transitions FOR SELECT TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');
CREATE POLICY entity_transitions_all_consolidated_insert ON public.entity_transitions FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');
CREATE POLICY entity_transitions_all_consolidated_update ON public.entity_transitions FOR UPDATE TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role')
  WITH CHECK (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');
CREATE POLICY entity_transitions_all_consolidated_delete ON public.entity_transitions FOR DELETE TO authenticated
  USING (tenant_id = (((SELECT auth.jwt()) ->> 'tenant_id'))::uuid OR (SELECT auth.role()) = 'service_role');

-- devai tables
DROP POLICY IF EXISTS devai_approvals_own_requests ON public.devai_approvals;
DROP POLICY IF EXISTS devai_approvals_insert_own   ON public.devai_approvals;
CREATE POLICY devai_approvals_own_requests ON public.devai_approvals FOR SELECT TO authenticated
  USING (requested_by = (SELECT auth.uid()) OR approved_by = (SELECT auth.uid()));
CREATE POLICY devai_approvals_insert_own ON public.devai_approvals FOR INSERT TO authenticated
  WITH CHECK (requested_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS devai_audit_insert ON public.devai_audit;
CREATE POLICY devai_audit_insert ON public.devai_audit FOR INSERT TO authenticated
  WITH CHECK (actor = (SELECT auth.uid()));

DROP POLICY IF EXISTS devai_health_alerts_select ON public.devai_health_alerts;
DROP POLICY IF EXISTS devai_health_alerts_insert ON public.devai_health_alerts;
DROP POLICY IF EXISTS devai_health_alerts_update ON public.devai_health_alerts;
DROP POLICY IF EXISTS devai_health_alerts_delete ON public.devai_health_alerts;
CREATE POLICY devai_health_alerts_select ON public.devai_health_alerts FOR SELECT TO authenticated
  USING (((SELECT auth.jwt()) ->> 'role') = 'service_role' OR EXISTS (SELECT 1 FROM public.users WHERE users.id = (((SELECT auth.jwt()) ->> 'sub'))::uuid AND (users.role)::text = 'superadmin'));
CREATE POLICY devai_health_alerts_insert ON public.devai_health_alerts FOR INSERT TO authenticated
  WITH CHECK (((SELECT auth.jwt()) ->> 'role') = 'service_role');
CREATE POLICY devai_health_alerts_update ON public.devai_health_alerts FOR UPDATE TO authenticated
  USING (((SELECT auth.jwt()) ->> 'role') = 'service_role' OR EXISTS (SELECT 1 FROM public.users WHERE users.id = (((SELECT auth.jwt()) ->> 'sub'))::uuid AND (users.role)::text = 'superadmin'));
CREATE POLICY devai_health_alerts_delete ON public.devai_health_alerts FOR DELETE TO authenticated
  USING (((SELECT auth.jwt()) ->> 'role') = 'service_role');

-- Consolidate multiple_permissive_policies
-- braid_audit_log: merge admin + superadmin SELECT into single policy
DROP POLICY IF EXISTS braid_audit_log_admin_select      ON public.braid_audit_log;
DROP POLICY IF EXISTS braid_audit_log_superadmin_select ON public.braid_audit_log;
CREATE POLICY braid_audit_log_admin_read ON public.braid_audit_log FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()) AND (u.role)::text = ANY (ARRAY['admin','superadmin'])) AND created_at > (now() - INTERVAL '30 days'));

-- system_settings: service_role_modify (ALL) covers SELECT; drop duplicate SELECT policy
DROP POLICY IF EXISTS system_settings_service_role_select ON public.system_settings;
DROP POLICY IF EXISTS system_settings_service_role_modify ON public.system_settings;
CREATE POLICY system_settings_service_role_modify ON public.system_settings FOR ALL TO authenticated
  USING ((SELECT auth.role()) = 'service_role')
  WITH CHECK ((SELECT auth.role()) = 'service_role');

COMMIT;
