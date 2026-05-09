-- 166_signing_sessions_archive_columns.sql
--
-- 4VD-43 day 4: soft-delete with mandatory reason.
--
-- Operators occasionally need to "delete" a signing_sessions row (wrong
-- template attached, recipient asked to redo, accounting cleanup, etc).
-- Hard-delete is unsafe — the audit jsonb is the legal trail (ESIGN Act
-- + eIDAS) and physically removing the row destroys it. Soft-archive
-- preserves the row + audit chain while flagging it as removed for UX
-- purposes.
--
-- Allowed on any status, including signed/completed (per Q2 product
-- decision). The line-through rendering in DocumentSignaturesSection.jsx
-- communicates "this was archived after signing" and the reason text
-- documents WHY for the next person who reads the timeline.
--
-- Permission gate is admin-only (per Q1) and enforced at the route layer
-- via requireAdminRole on POST /api/submissions/:id/archive — no policy
-- restriction needed in DB.

ALTER TABLE public.signing_sessions
  ADD COLUMN IF NOT EXISTS archived_at timestamptz,
  ADD COLUMN IF NOT EXISTS archive_reason text,
  ADD COLUMN IF NOT EXISTS archived_by uuid REFERENCES public.users(id) ON DELETE SET NULL;

-- Partial index — vast majority of rows are NOT archived; cheap.
CREATE INDEX IF NOT EXISTS idx_signing_sessions_archived
  ON public.signing_sessions (tenant_id)
  WHERE archived_at IS NOT NULL;

COMMENT ON COLUMN public.signing_sessions.archived_at IS
  '4VD-43 day 4: soft-delete timestamp; row stays for audit trail. UI line-throughs archived rows.';
COMMENT ON COLUMN public.signing_sessions.archive_reason IS
  '4VD-43 day 4: mandatory free-text reason captured at archive time. Renders in DocumentSignaturesSection beside the line-through entry.';
COMMENT ON COLUMN public.signing_sessions.archived_by IS
  '4VD-43 day 4: user who archived. SET NULL on user delete so the row survives the user being removed from the tenant.';