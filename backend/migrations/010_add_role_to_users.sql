-- Add role column to users table for global admins/superadmins
-- This allows superadmins to exist without tenant assignment

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS role VARCHAR(50) DEFAULT 'employee';

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Update existing admin user to superadmin role
UPDATE users 
SET role = 'superadmin' 
WHERE email = 'admin@aishacrm.com';

-- Create index for faster role lookups
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
