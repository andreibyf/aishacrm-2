-- Flatten opportunities table: move commonly used fields from metadata to direct columns

ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS expected_revenue DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS next_step TEXT;
