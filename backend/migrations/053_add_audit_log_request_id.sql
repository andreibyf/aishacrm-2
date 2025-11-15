-- Migration: Add request_id and indexes to audit_log
-- 2025-11-15

BEGIN;

-- Add request_id column if it doesn't exist
ALTER TABLE audit_log
  ADD COLUMN IF NOT EXISTS request_id text;

-- Add indexes to speed up queries
CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created_at ON audit_log (tenant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user_email ON audit_log (user_email);
CREATE INDEX IF NOT EXISTS idx_audit_log_request_id ON audit_log (request_id);

COMMIT;
