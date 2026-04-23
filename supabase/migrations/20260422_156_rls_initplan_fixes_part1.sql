-- Migration: 156_rls_initplan_fixes (part 1 of 2 — auth.uid() patterns)
-- Applied to DEV + PROD on 2026-04-22.
-- Wraps auth.uid()/current_setting() in (SELECT ...) so PostgreSQL computes
-- them once per query (InitPlan) instead of once per row.
-- See https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
-- Re-runnable: every policy is DROPped IF EXISTS then recreated.

BEGIN;

-- client_requirement
DROP POLICY IF EXISTS tenant_isolation_client_requirement_select ON public.client_requirement;
DROP POLICY IF EXISTS tenant_isolation_client_requirement_insert ON public.client_requirement;
DROP POLICY IF EXISTS tenant_isolation_client_requirement_update ON public.client_requirement;
DROP POLICY IF EXISTS tenant_isolation_client_requirement_delete ON public.client_requirement;
CREATE POLICY tenant_isolation_client_requirement_select ON public.client_requirement FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_client_requirement_insert ON public.client_requirement FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_client_requirement_update ON public.client_requirement FOR UPDATE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_client_requirement_delete ON public.client_requirement FOR DELETE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- note
DROP POLICY IF EXISTS tenant_isolation_note_select ON public.note;
DROP POLICY IF EXISTS tenant_isolation_note_insert ON public.note;
DROP POLICY IF EXISTS tenant_isolation_note_update ON public.note;
DROP POLICY IF EXISTS tenant_isolation_note_delete ON public.note;
CREATE POLICY tenant_isolation_note_select ON public.note FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_note_insert ON public.note FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_note_update ON public.note FOR UPDATE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_note_delete ON public.note FOR DELETE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- notifications
DROP POLICY IF EXISTS tenant_isolation_notifications_select ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_notifications_insert ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_notifications_update ON public.notifications;
DROP POLICY IF EXISTS tenant_isolation_notifications_delete ON public.notifications;
CREATE POLICY tenant_isolation_notifications_select ON public.notifications FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_notifications_insert ON public.notifications FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_notifications_update ON public.notifications FOR UPDATE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_notifications_delete ON public.notifications FOR DELETE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- person_profile
DROP POLICY IF EXISTS tenant_select_person_profile ON public.person_profile;
DROP POLICY IF EXISTS tenant_insert_person_profile ON public.person_profile;
DROP POLICY IF EXISTS tenant_update_person_profile ON public.person_profile;
DROP POLICY IF EXISTS tenant_delete_person_profile ON public.person_profile;
CREATE POLICY tenant_select_person_profile ON public.person_profile FOR SELECT TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_insert_person_profile ON public.person_profile FOR INSERT TO public
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_update_person_profile ON public.person_profile FOR UPDATE TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_delete_person_profile ON public.person_profile FOR DELETE TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- project_assignments
DROP POLICY IF EXISTS project_assignments_select_policy ON public.project_assignments;
DROP POLICY IF EXISTS project_assignments_insert_policy ON public.project_assignments;
DROP POLICY IF EXISTS project_assignments_update_policy ON public.project_assignments;
DROP POLICY IF EXISTS project_assignments_delete_policy ON public.project_assignments;
CREATE POLICY project_assignments_select_policy ON public.project_assignments FOR SELECT TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY project_assignments_insert_policy ON public.project_assignments FOR INSERT TO public
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY project_assignments_update_policy ON public.project_assignments FOR UPDATE TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY project_assignments_delete_policy ON public.project_assignments FOR DELETE TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- synchealth (includes bypass_rls escape hatch)
DROP POLICY IF EXISTS synchealth_tenant_isolation_select ON public.synchealth;
DROP POLICY IF EXISTS synchealth_tenant_isolation_insert ON public.synchealth;
DROP POLICY IF EXISTS synchealth_tenant_isolation_update ON public.synchealth;
DROP POLICY IF EXISTS synchealth_tenant_isolation_delete ON public.synchealth;
CREATE POLICY synchealth_tenant_isolation_select ON public.synchealth FOR SELECT TO public
  USING ((((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))) OR ((SELECT current_setting('app.bypass_rls', true)) = 'true'));
CREATE POLICY synchealth_tenant_isolation_insert ON public.synchealth FOR INSERT TO public
  WITH CHECK ((((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))) OR ((SELECT current_setting('app.bypass_rls', true)) = 'true'));
CREATE POLICY synchealth_tenant_isolation_update ON public.synchealth FOR UPDATE TO public
  USING ((((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))) OR ((SELECT current_setting('app.bypass_rls', true)) = 'true'));
CREATE POLICY synchealth_tenant_isolation_delete ON public.synchealth FOR DELETE TO public
  USING ((((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid()))) OR ((SELECT current_setting('app.bypass_rls', true)) = 'true'));

-- workers
DROP POLICY IF EXISTS workers_select_policy ON public.workers;
DROP POLICY IF EXISTS workers_insert_policy ON public.workers;
DROP POLICY IF EXISTS workers_update_policy ON public.workers;
DROP POLICY IF EXISTS workers_delete_policy ON public.workers;
CREATE POLICY workers_select_policy ON public.workers FOR SELECT TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY workers_insert_policy ON public.workers FOR INSERT TO public
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY workers_update_policy ON public.workers FOR UPDATE TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY workers_delete_policy ON public.workers FOR DELETE TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- workflow
DROP POLICY IF EXISTS tenant_isolation_workflow_select ON public.workflow;
DROP POLICY IF EXISTS tenant_isolation_workflow_insert ON public.workflow;
DROP POLICY IF EXISTS tenant_isolation_workflow_update ON public.workflow;
DROP POLICY IF EXISTS tenant_isolation_workflow_delete ON public.workflow;
CREATE POLICY tenant_isolation_workflow_select ON public.workflow FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_workflow_insert ON public.workflow FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_workflow_update ON public.workflow FOR UPDATE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_workflow_delete ON public.workflow FOR DELETE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- workflow_execution
DROP POLICY IF EXISTS tenant_isolation_workflow_execution_select ON public.workflow_execution;
DROP POLICY IF EXISTS tenant_isolation_workflow_execution_insert ON public.workflow_execution;
DROP POLICY IF EXISTS tenant_isolation_workflow_execution_update ON public.workflow_execution;
DROP POLICY IF EXISTS tenant_isolation_workflow_execution_delete ON public.workflow_execution;
CREATE POLICY tenant_isolation_workflow_execution_select ON public.workflow_execution FOR SELECT TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_workflow_execution_insert ON public.workflow_execution FOR INSERT TO public
  WITH CHECK (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_workflow_execution_update ON public.workflow_execution FOR UPDATE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY tenant_isolation_workflow_execution_delete ON public.workflow_execution FOR DELETE TO public
  USING (((SELECT auth.uid()) IS NOT NULL) AND tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- entity_labels
DROP POLICY IF EXISTS entity_labels_select_policy ON public.entity_labels;
CREATE POLICY entity_labels_select_policy ON public.entity_labels FOR SELECT TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- name_to_employee
DROP POLICY IF EXISTS name_to_employee_tenant_isolation ON public.name_to_employee;
CREATE POLICY name_to_employee_tenant_isolation ON public.name_to_employee FOR SELECT TO public
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

-- project_milestones (authenticated role variant)
DROP POLICY IF EXISTS project_milestones_select_policy ON public.project_milestones;
DROP POLICY IF EXISTS project_milestones_insert_policy ON public.project_milestones;
DROP POLICY IF EXISTS project_milestones_update_policy ON public.project_milestones;
DROP POLICY IF EXISTS project_milestones_delete_policy ON public.project_milestones;
CREATE POLICY project_milestones_select_policy ON public.project_milestones FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY project_milestones_insert_policy ON public.project_milestones FOR INSERT TO authenticated
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY project_milestones_update_policy ON public.project_milestones FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())))
  WITH CHECK (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));
CREATE POLICY project_milestones_delete_policy ON public.project_milestones FOR DELETE TO authenticated
  USING (tenant_id IN (SELECT u.tenant_id FROM public.users u WHERE u.id = (SELECT auth.uid())));

COMMIT;
