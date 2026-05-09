-- 163_signing_sessions.sql
--
-- 4VD-43: in-house eSign engine v1 — signing_sessions table.
--
-- One row per recipient per send. signing_token is a 32-byte hex capability
-- token used by the public /sign/<token> route (no auth required, gated on
-- token presence + expires_at). field_values jsonb captures what the
-- recipient typed/signed; audit jsonb captures the action trail
-- (viewed/started/signed/completed) with IP + UA + timestamp for legal
-- admissibility (ESIGN Act + eIDAS).
--
-- signed_pdf_storage_path is set after pdf-lib stamps the signature into the
-- source PDF and uploads to tenant-assets/<tenant_id>/signed/<session_id>.pdf.
--
-- Applied to dev (nrtrjsatmsosslxwlmoj) on 2026-05-09 via apply_migration MCP.
-- Pending application to staging (bjedfowimuwbcnruwcdj) and prod
-- (ehjlenywplgyiahgxkfj).

CREATE TABLE IF NOT EXISTS public.signing_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
  template_id uuid NOT NULL REFERENCES public.signing_templates(id) ON DELETE RESTRICT,
  related_to text NOT NULL CHECK (related_to IN ('contact','lead','account','opportunity')),
  related_id uuid NOT NULL,
  recipient_email text NOT NULL,
  recipient_name text,
  signing_token text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','viewed','signed','completed','declined','expired')),
  signed_pdf_storage_path text,
  field_values jsonb NOT NULL DEFAULT '{}'::jsonb,
  audit jsonb NOT NULL DEFAULT '[]'::jsonb,
  message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  viewed_at timestamptz,
  signed_at timestamptz,
  completed_at timestamptz,
  declined_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_signing_sessions_token
  ON public.signing_sessions (signing_token);

CREATE INDEX IF NOT EXISTS idx_signing_sessions_tenant_related
  ON public.signing_sessions (tenant_id, related_to, related_id);

CREATE INDEX IF NOT EXISTS idx_signing_sessions_template
  ON public.signing_sessions (template_id);

CREATE INDEX IF NOT EXISTS idx_signing_sessions_tenant_created
  ON public.signing_sessions (tenant_id, created_at DESC);

CREATE TRIGGER trg_signing_sessions_updated_at
  BEFORE UPDATE ON public.signing_sessions
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

ALTER TABLE public.signing_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY signing_sessions_tenant_select ON public.signing_sessions
  FOR SELECT TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY signing_sessions_tenant_insert ON public.signing_sessions
  FOR INSERT TO authenticated
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY signing_sessions_tenant_update ON public.signing_sessions
  FOR UPDATE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()))
  WITH CHECK (tenant_id = (SELECT public.current_tenant_id()));

CREATE POLICY signing_sessions_tenant_delete ON public.signing_sessions
  FOR DELETE TO authenticated
  USING (tenant_id = (SELECT public.current_tenant_id()));

-- The /sign/<token> public route runs AS service_role (recipient isn't an
-- authenticated user). Service role bypasses RLS by default in Supabase, so
-- no anonymous policy is needed; the backend enforces token presence +
-- expires_at + tenant_id stamping itself.

COMMENT ON TABLE public.signing_sessions IS
  '4VD-43: in-house eSign engine. One row per recipient per send. signing_token gates the public /sign/<token> page; audit jsonb is the legal trail (IP+UA+timestamp per action).';
