-- Migration 091: Add unique constraint to prevent duplicate AI suggestions
-- Prevents creating new pending suggestions for records that already have one

BEGIN;

-- Add unique partial index to prevent duplicate pending suggestions for same record
-- Only applies to pending suggestions (rejected/applied suggestions don't block new ones for same record)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ai_suggestions_unique_pending
  ON ai_suggestions(tenant_id, trigger_id, record_id)
  WHERE status = 'pending';

-- Add comment explaining the constraint
COMMENT ON INDEX idx_ai_suggestions_unique_pending IS 
  'Prevents duplicate pending suggestions for the same trigger and record. Rejected suggestions do not block new suggestions.';

COMMIT;
