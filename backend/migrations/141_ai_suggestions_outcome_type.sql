-- Migration 141: Add outcome_type column to ai_suggestions
-- Feature: AI outcome classification (C.A.R.E. trigger evaluation)
-- Safe: nullable, no default, no backfill, idempotent via IF NOT EXISTS

ALTER TABLE ai_suggestions
ADD COLUMN IF NOT EXISTS outcome_type TEXT NULL;
