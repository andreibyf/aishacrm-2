-- Migration: 181_ai_settings_max_tools_min_floor.sql
-- Description: Fix min constraint and stale values in ai_settings for max_tools
--
-- Context: Migration 180 only updated setting_value->>'value' but left min:5 intact.
-- The PUT /api/ai-settings/:id handler enforces meta.min from the stored row, so
-- rows with min:5 allow the UI to save values down to 5 — below CORE_TOOLS length (15),
-- which causes slotsForOthers <= 0 and silently drops non-core intent tools.
--
-- Also fixes any rows still at value < 15 (e.g. seeded by old backend code after
-- migration 180 ran against an empty table).
--
-- This migration:
--   1. Sets min to 15 for all max_tools rows (the CORE_TOOLS floor)
--   2. Bumps value to 20 for any row still below 15
--   3. Updates the description to surface the minimum constraint

UPDATE ai_settings
SET
  setting_value = setting_value
    || jsonb_build_object('min', 15)
    || CASE
         WHEN (setting_value->>'value')::int < 15
         THEN jsonb_build_object('value', 20)
         ELSE '{}'::jsonb
       END,
  description   = 'Limits tool schemas sent to AI. Minimum 15 (reserved for core AiSHA tools). More tools = more capabilities but higher token cost per request.',
  updated_at    = NOW()
WHERE
  setting_key = 'max_tools'
  AND agent_role = 'aisha';

NOTIFY pgrst, 'reload schema';
