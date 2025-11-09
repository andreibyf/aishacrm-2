-- Migration 031: Rename cash_flow.type to transaction_type for better clarity
-- This follows better naming conventions where the field name is more descriptive

-- Rename the column
ALTER TABLE cash_flow 
  RENAME COLUMN type TO transaction_type;

-- Update any comments or documentation
COMMENT ON COLUMN cash_flow.transaction_type IS 'Type of transaction: income or expense';
