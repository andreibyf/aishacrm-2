-- Migration 038: Add tenant_uuid column to users for dual tenant linkage
-- Ensures each admin/superadmin user can reference both the human-readable tenant_id (slug)
-- and the canonical tenant UUID (tenant.id). Superadmins remain global with NULL tenant_uuid.

-- 1. Add tenant_uuid column (nullable, foreign key to tenant.id)
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tenant_uuid UUID NULL;

-- 2. Add foreign key constraint (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'users' AND constraint_name = 'fk_users_tenant_uuid'
  ) THEN
    ALTER TABLE users
    ADD CONSTRAINT fk_users_tenant_uuid FOREIGN KEY (tenant_uuid)
    REFERENCES tenant(id) ON DELETE SET NULL;
  END IF;
END$$;

-- 3. Index for efficient lookups by tenant_uuid
CREATE INDEX IF NOT EXISTS idx_users_tenant_uuid ON users(tenant_uuid);

-- 4. Backfill tenant_uuid for rows that have tenant_id but NULL tenant_uuid
--    This maps users.tenant_id (text) to tenant.tenant_id (text) and copies tenant.id (UUID)
UPDATE users u
SET tenant_uuid = t.id
FROM tenant t
WHERE u.tenant_uuid IS NULL
  AND u.tenant_id IS NOT NULL
  AND t.tenant_id = u.tenant_id;

-- 5. Comment for clarity
COMMENT ON COLUMN users.tenant_uuid IS 'Foreign key to tenant(id). Null for global superadmins. Backfilled from tenant_id.';

-- 6. Optional safety verification (no-op if no mismatches)
-- SELECT u.id as user_id, u.tenant_id, u.tenant_uuid, t.id as expected_uuid
-- FROM users u
-- LEFT JOIN tenant t ON t.tenant_id = u.tenant_id
-- WHERE u.tenant_id IS NOT NULL AND (u.tenant_uuid IS NULL OR u.tenant_uuid <> t.id);
