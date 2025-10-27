-- Add annual_revenue column to accounts table for financial tracking
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS annual_revenue NUMERIC(15, 2);

-- Add index for performance when sorting by revenue
CREATE INDEX IF NOT EXISTS idx_accounts_revenue ON accounts(annual_revenue DESC) WHERE annual_revenue IS NOT NULL;
