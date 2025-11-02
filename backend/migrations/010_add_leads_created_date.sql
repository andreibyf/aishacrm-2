-- Add created_date column to leads table
-- The frontend expects created_date for age calculations, but table only has created_at

-- Add created_date column with default from created_at
ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_date TIMESTAMPTZ DEFAULT now();

-- Backfill existing records: set created_date = created_at
UPDATE leads 
SET created_date = created_at 
WHERE created_date IS NULL OR created_date < '2000-01-01'::timestamptz;

-- Create a trigger to automatically sync created_date with created_at on INSERT
CREATE OR REPLACE FUNCTION sync_leads_created_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set created_date if it's not explicitly provided
  IF NEW.created_date IS NULL THEN
    NEW.created_date := NEW.created_at;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop trigger if exists (for idempotency)
DROP TRIGGER IF EXISTS trigger_sync_leads_created_date ON leads;

-- Create trigger that fires before INSERT
CREATE TRIGGER trigger_sync_leads_created_date
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION sync_leads_created_date();

-- Create index for created_date queries (used in age filters)
CREATE INDEX IF NOT EXISTS idx_leads_created_date ON leads(tenant_id, created_date DESC);
