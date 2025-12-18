-- ============================================================
-- Allow NULL tenant_id for system_logs
-- ============================================================
-- System logs may not always have a tenant context (e.g., system
-- startup events, cross-tenant monitoring, superadmin actions).
-- This migration makes tenant_id nullable to support global logging.
--
-- Security is maintained via RLS policies that restrict access based
-- on user authentication context.
-- ============================================================

-- Make tenant_id nullable
ALTER TABLE system_logs ALTER COLUMN tenant_id DROP NOT NULL;

-- Update RLS policies to handle NULL tenant_id
-- Drop existing policy if it exists
DROP POLICY IF EXISTS system_logs_tenant_isolation_policy ON system_logs;

-- Create new policy that allows:
-- 1. Superadmins to see all logs (including NULL tenant_id)
-- 2. Regular users to see only their tenant's logs
-- 3. All authenticated users to INSERT with their own tenant_id or NULL
CREATE POLICY system_logs_tenant_isolation_policy ON system_logs
  FOR ALL
  TO authenticated
  USING (
    -- Superadmins can read all logs
    EXISTS (
      SELECT 1 FROM users 
      WHERE users.id = auth.uid() 
      AND users.role = 'superadmin'
    )
    OR
    -- Regular users can only see their tenant's logs
    tenant_id IN (
      SELECT tenant_uuid FROM users WHERE id = auth.uid()
    )
  )
  WITH CHECK (
    -- Allow INSERT with user's own tenant_id or NULL
    tenant_id IS NULL
    OR
    tenant_id IN (
      SELECT tenant_uuid FROM users WHERE id = auth.uid()
    )
  );

-- Add index for performance (NULL values in PostgreSQL are indexed)
CREATE INDEX IF NOT EXISTS idx_system_logs_tenant_id ON system_logs(tenant_id)
WHERE tenant_id IS NOT NULL;

-- Create partial index for NULL tenant_id logs (global/system logs)
CREATE INDEX IF NOT EXISTS idx_system_logs_global ON system_logs(created_at DESC)
WHERE tenant_id IS NULL;

COMMENT ON COLUMN system_logs.tenant_id IS 'Tenant ID (UUID) or NULL for global system logs. NULL = system-wide events visible only to superadmins.';
