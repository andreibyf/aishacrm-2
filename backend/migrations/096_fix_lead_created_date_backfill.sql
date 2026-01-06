-- Fix existing leads with NULL or epoch dates in created_date column
-- This ensures all leads have proper created_date values for age calculations

-- Update any leads where created_date is NULL or before year 2000
-- Uses created_at as the source of truth, or current timestamp if created_at is also NULL
UPDATE leads 
SET created_date = COALESCE(created_at, NOW()) 
WHERE created_date IS NULL 
   OR created_date < '2000-01-01'::timestamptz;

-- Verify the trigger exists (from migration 010)
-- If not, create it to auto-populate created_date on new inserts
CREATE OR REPLACE FUNCTION sync_leads_created_date()
RETURNS TRIGGER AS $$
BEGIN
  -- Only set created_date if it's not explicitly provided or is NULL
  IF NEW.created_date IS NULL THEN
    NEW.created_date := COALESCE(NEW.created_at, NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recreate trigger to ensure it's active
DROP TRIGGER IF EXISTS trigger_sync_leads_created_date ON leads;
CREATE TRIGGER trigger_sync_leads_created_date
  BEFORE INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION sync_leads_created_date();

-- Add index if not exists (for age-based queries)
CREATE INDEX IF NOT EXISTS idx_leads_created_date ON leads(tenant_id, created_date DESC);
