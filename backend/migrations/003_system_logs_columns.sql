-- Add missing columns to system_logs table

ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS user_email TEXT;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS url TEXT;
ALTER TABLE system_logs ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ;

-- Update created_date from created_at for existing records
UPDATE system_logs SET created_date = created_at WHERE created_date IS NULL;

-- Add trigger to sync created_date with created_at
DROP TRIGGER IF EXISTS sync_system_logs_created_date ON system_logs;
CREATE TRIGGER sync_system_logs_created_date
  BEFORE INSERT OR UPDATE ON system_logs
  FOR EACH ROW EXECUTE FUNCTION sync_created_date();

-- Add index for user_email lookups
CREATE INDEX IF NOT EXISTS idx_system_logs_user ON system_logs(tenant_id, user_email);
