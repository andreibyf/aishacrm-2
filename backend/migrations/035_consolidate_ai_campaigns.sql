-- =============================================================
-- Migration 035: Consolidate AI campaign tables
-- Merges ai_campaign (singular, legacy) into ai_campaigns (plural)
--
-- Goals:
--   1. Merge data from ai_campaign → ai_campaigns
--   2. Map old fields to new schema:
--      - type → metadata.type
--      - target_audience → metadata.target_audience
--      - content → metadata.content
--      - scheduled_at → metadata.scheduled_at
--      - sent_at → metadata.sent_at
--   3. Drop legacy ai_campaign table
--
-- Safety Notes:
--   • Both tables currently empty (safe to consolidate)
--   • Idempotent guards included
-- =============================================================

BEGIN;

-- 1. Migrate data from legacy ai_campaign if it exists and has data
DO $$
DECLARE
  _exists BOOLEAN;
  _rec RECORD;
BEGIN
  SELECT EXISTS (
    SELECT FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'ai_campaign'
  ) INTO _exists;
  
  IF _exists THEN
    -- Migrate rows from singular to plural table
    FOR _rec IN SELECT * FROM ai_campaign LOOP
      INSERT INTO ai_campaigns (
        id,
        tenant_id,
        name,
        status,
        description,
        target_contacts,
        performance_metrics,
        metadata,
        created_at,
        updated_at
      )
      VALUES (
        _rec.id,
        _rec.tenant_id,
        _rec.name,
        _rec.status,
        NULL, -- legacy table has no description
        '[]'::jsonb, -- legacy table uses target_audience instead
        '{}'::jsonb, -- legacy table has no performance_metrics
        jsonb_build_object(
          'type', _rec.type,
          'target_audience', _rec.target_audience,
          'content', _rec.content,
          'scheduled_at', _rec.scheduled_at,
          'sent_at', _rec.sent_at,
          'migrated_from', 'ai_campaign',
          'migrated_at', NOW()
        ) || COALESCE(_rec.metadata, '{}'::jsonb),
        _rec.created_at,
        _rec.updated_at
      )
      ON CONFLICT (id) DO UPDATE SET
        metadata = ai_campaigns.metadata || EXCLUDED.metadata,
        updated_at = NOW();
    END LOOP;
  END IF;
END$$;

-- 2. Drop legacy table
DROP TABLE IF EXISTS ai_campaign;

COMMIT;

-- =============================================================
-- Verification queries (optional run manually after migration):
-- SELECT id, name, status, metadata FROM ai_campaigns ORDER BY created_at;
-- SELECT COUNT(*) FROM ai_campaigns;
-- =============================================================
