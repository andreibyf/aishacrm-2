-- Allow NULL tenant_id for employees without a client/tenant
-- This enables "No Client" to be a true NULL value instead of a special string

ALTER TABLE employees 
ALTER COLUMN tenant_id DROP NOT NULL;

-- Update any existing 'no-client' values to NULL
UPDATE employees 
SET tenant_id = NULL 
WHERE tenant_id = 'no-client';

-- Add a comment for clarity
COMMENT ON COLUMN employees.tenant_id IS 'Tenant identifier. NULL indicates employee has no assigned client/tenant.';
