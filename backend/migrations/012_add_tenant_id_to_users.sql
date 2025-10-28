-- Add tenant_id column to users table to support tenant-scoped admins
-- Superadmins will have NULL tenant_id (global access)
-- Admins will have specific tenant_id (tenant-scoped access)

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS tenant_id TEXT DEFAULT NULL;

-- Create index for faster tenant lookups
CREATE INDEX IF NOT EXISTS idx_users_tenant_id ON users(tenant_id);

-- Add comment for clarity
COMMENT ON COLUMN users.tenant_id IS 'NULL for superadmins (global access), specific tenant_id for tenant-scoped admins';
