-- Migration: 180_ai_settings_max_tools_floor.sql
-- Description: Raise max_tools to 20 for any row still at the old default (12)
--
-- Context: CORE_TOOLS was expanded from 13 → 15 entries in the CORE_TOOLS cap fix
-- (commit 7d540167). Any tenant/global row with max_tools ≤ 14 has slotsForOthers ≤ 0
-- when intent is detected, which silently drops non-core intent tools (create_contact,
-- create_opportunity, etc.) even when they are explicitly routed.
--
-- This migration bumps those rows to 20, which gives 5 slots for non-core tools.
-- Rows already at 15+ are left untouched (tenant chose a custom value above the floor).

UPDATE ai_settings
SET
  setting_value = jsonb_set(setting_value, '{value}', '20'),
  updated_at    = NOW()
WHERE
  setting_key       = 'max_tools'
  AND agent_role    = 'aisha'
  AND (setting_value->>'value')::int < 15;

-- Notify PostgREST to reload schema (required after any DDL/data change visible to API)
NOTIFY pgrst, 'reload schema';
