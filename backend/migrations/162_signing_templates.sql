-- 162_signing_templates.sql
--
-- 4VD-43: in-house eSign engine v1 — signing_templates table.
--
-- Per-tenant templates created via the CRM-native builder
-- (src/pages/DocumentTemplates.jsx + src/components/docuseal/TemplateBuilderCanvas.jsx).
-- Source PDF lives in Supabase Storage at
--   tenant-assets/<tenant_id>/templates/<template_id>.pdf
-- Field placement metadata lives in the `fields` jsonb column (BuilderField[]
-- schema, see src/lib/docusealFieldCoords.js — to be renamed
-- src/lib/signingFieldCoords.js in a follow-up commit, behavior unchanged).
--
-- Naming: `signing_templates` (not `templates`) because the existing
-- public.templates is a generic table with `type` discriminator used by
-- email_template / workflow_template specializations. eSign concerns get
-- their own table to avoid jamming pdf_storage_path + signing-specific
-- fields into a generic shape.
--
-- Applied to dev (nrtrjsatmsosslxwlmoj) on 2026-05-09 via apply_migration MCP.
-- Pending application to staging (bjedfowimuwbcnruwcdj) and prod
-- (ehjlenywplgyiahgxkfj).

CREATE TABLE IF NOT EXISTS public.signing_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  name text NOT NULL,
  pdf_storage_path text NOT NULL,
  fields jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  archived_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_signing_templates_tenant_active
  ON public.signing_templates (tenant_id)
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_signing_templates_created_at
  ON public.signing_templates (tenant_id, created_at DESC);

CREATE TRIGGER trg_signing_templates_updated_at
  BEFORE UPDATE ON public.signing_templates
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.signing_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_templates_tenant_select ON public.signing_templates
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY signing_templates_tenant_insert ON public.signing_templates
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY signing_templates_tenant_update ON public.signing_templates
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY signing_templates_tenant_delete ON public.signing_templates
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

COMMENT ON TABLE public.signing_templates IS
  '4VD-43: in-house eSign engine. Per-tenant templates: PDF in tenant-assets storage, field placement in fields jsonb. Replaces the DocuSeal Pro /api/templates/pdf path.';
