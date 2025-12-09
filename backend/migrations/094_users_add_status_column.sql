-- Migration 094: Add status column to users table
-- This column was manually added to production to fix auth/refresh failures
-- The status column is used by auth endpoints to verify user account status

ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';

-- Add comment for documentation
COMMENT ON COLUMN users.status IS 'User account status: active, inactive, suspended, etc.';
