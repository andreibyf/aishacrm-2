-- Migration: Add type column to note table (flatten from metadata)
-- Created: 2026-01-09
-- Purpose: Enable direct type filtering without JSONB extraction

-- Add type column with default
ALTER TABLE note ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'general';

-- Create index for type filtering
CREATE INDEX IF NOT EXISTS idx_note_type ON note(type);

-- Migrate existing metadata.type or metadata.note_type to column
UPDATE note 
SET type = COALESCE(metadata->>'type', metadata->>'note_type', 'general')
WHERE type IS NULL OR type = 'general';
