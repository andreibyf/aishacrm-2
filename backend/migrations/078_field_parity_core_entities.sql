-- 078_field_parity_core_entities.sql
-- Promote frequently used UI fields to first-class columns so data round-trips reliably
-- Safe to run repeatedly (guarded with IF NOT EXISTS and conditional updates)

BEGIN;

-- ---------------------------------------------------------------------------
-- Leads
-- ---------------------------------------------------------------------------
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS score INTEGER DEFAULT 50,
  ADD COLUMN IF NOT EXISTS score_reason TEXT,
  ADD COLUMN IF NOT EXISTS estimated_value NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS do_not_call BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS do_not_text BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS address_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT,
  ADD COLUMN IF NOT EXISTS unique_id TEXT;

-- Handle tags column: if it exists as JSONB, rename it and create new TEXT[] column
DO $$
BEGIN
  -- Check if tags column exists and is JSONB
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'tags' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE leads RENAME COLUMN tags TO tags_jsonb_old;
  END IF;
  
  -- Add TEXT[] column if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'tags' AND udt_name = '_text'
  ) THEN
    ALTER TABLE leads ADD COLUMN tags TEXT[] DEFAULT '{}'::text[];
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(tenant_id, city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(tenant_id, state) WHERE state IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_do_not_call ON leads(tenant_id, do_not_call) WHERE do_not_call = true;
CREATE INDEX IF NOT EXISTS idx_leads_do_not_text ON leads(tenant_id, do_not_text) WHERE do_not_text = true;

UPDATE leads
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

-- Backfill from metadata (legacy rows)
UPDATE leads
SET score = (metadata ->> 'score')::INTEGER
WHERE score IS NULL
  AND metadata ? 'score'
  AND (metadata ->> 'score') ~ '^-?\\d+$';

UPDATE leads
SET score_reason = metadata ->> 'score_reason'
WHERE score_reason IS NULL
  AND metadata ? 'score_reason'
  AND (metadata ->> 'score_reason') <> '';

UPDATE leads
SET estimated_value = (metadata ->> 'estimated_value')::NUMERIC
WHERE estimated_value IS NULL
  AND metadata ? 'estimated_value'
  AND (metadata ->> 'estimated_value') ~ '^-?\\d+(\\.\\d+)?$';

UPDATE leads
SET do_not_call = CASE
    WHEN lower(metadata ->> 'do_not_call') = 'true' THEN true
    WHEN lower(metadata ->> 'do_not_call') = 'false' THEN false
    ELSE do_not_call
  END
WHERE metadata ? 'do_not_call'
  AND lower(metadata ->> 'do_not_call') IN ('true','false');

UPDATE leads
SET do_not_text = CASE
    WHEN lower(metadata ->> 'do_not_text') = 'true' THEN true
    WHEN lower(metadata ->> 'do_not_text') = 'false' THEN false
    ELSE do_not_text
  END
WHERE metadata ? 'do_not_text'
  AND lower(metadata ->> 'do_not_text') IN ('true','false');

UPDATE leads
SET address_1 = COALESCE(address_1, metadata ->> 'address_1')
WHERE metadata ? 'address_1'
  AND (metadata ->> 'address_1') IS NOT NULL
  AND (metadata ->> 'address_1') <> '';

UPDATE leads
SET address_2 = COALESCE(address_2, metadata ->> 'address_2')
WHERE metadata ? 'address_2'
  AND (metadata ->> 'address_2') IS NOT NULL
  AND (metadata ->> 'address_2') <> '';

UPDATE leads
SET city = COALESCE(city, metadata ->> 'city')
WHERE metadata ? 'city'
  AND (metadata ->> 'city') <> '';

UPDATE leads
SET state = COALESCE(state, metadata ->> 'state')
WHERE metadata ? 'state'
  AND (metadata ->> 'state') <> '';

UPDATE leads
SET zip = COALESCE(zip, metadata ->> 'zip')
WHERE metadata ? 'zip'
  AND (metadata ->> 'zip') <> '';

UPDATE leads
SET country = COALESCE(country, metadata ->> 'country')
WHERE metadata ? 'country'
  AND (metadata ->> 'country') <> '';

UPDATE leads
SET unique_id = COALESCE(unique_id, metadata ->> 'unique_id')
WHERE metadata ? 'unique_id'
  AND (metadata ->> 'unique_id') <> '';

-- Backfill tags from old JSONB column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'leads' AND column_name = 'tags_jsonb_old'
  ) THEN
    UPDATE leads
    SET tags = ARRAY(SELECT jsonb_array_elements_text(tags_jsonb_old))
    WHERE (tags IS NULL OR tags = '{}'::text[])
      AND tags_jsonb_old IS NOT NULL
      AND jsonb_typeof(tags_jsonb_old) = 'array';
  END IF;
END $$;

-- Backfill tags from metadata
UPDATE leads
SET tags = ARRAY(SELECT jsonb_array_elements_text(metadata -> 'tags'))
WHERE (tags IS NULL OR tags = '{}'::text[])
  AND metadata ? 'tags'
  AND jsonb_typeof(metadata -> 'tags') = 'array';

UPDATE leads
SET metadata = COALESCE(metadata, '{}'::jsonb)
               - 'score' - 'score_reason' - 'estimated_value'
               - 'do_not_call' - 'do_not_text'
               - 'address_1' - 'address_2' - 'city' - 'state' - 'zip' - 'country'
               - 'unique_id' - 'tags'
WHERE metadata ?| ARRAY['score','score_reason','estimated_value','do_not_call','do_not_text','address_1','address_2','city','state','zip','country','unique_id','tags'];

-- ---------------------------------------------------------------------------
-- Contacts
-- ---------------------------------------------------------------------------
ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS mobile TEXT,
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS address_1 TEXT,
  ADD COLUMN IF NOT EXISTS address_2 TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS zip TEXT,
  ADD COLUMN IF NOT EXISTS country TEXT;

-- Handle tags column: if it exists as JSONB, rename it and create new TEXT[] column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'tags' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE contacts RENAME COLUMN tags TO tags_jsonb_old;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'tags' AND udt_name = '_text'
  ) THEN
    ALTER TABLE contacts ADD COLUMN tags TEXT[] DEFAULT '{}'::text[];
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contacts_city ON contacts(tenant_id, city) WHERE city IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_contacts_state ON contacts(tenant_id, state) WHERE state IS NOT NULL;

UPDATE contacts
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

UPDATE contacts
SET mobile = COALESCE(mobile, metadata ->> 'mobile')
WHERE metadata ? 'mobile'
  AND (metadata ->> 'mobile') <> '';

UPDATE contacts
SET lead_source = COALESCE(lead_source, metadata ->> 'lead_source')
WHERE metadata ? 'lead_source'
  AND (metadata ->> 'lead_source') <> '';

UPDATE contacts
SET address_1 = COALESCE(address_1, metadata ->> 'address_1')
WHERE metadata ? 'address_1'
  AND (metadata ->> 'address_1') <> '';

UPDATE contacts
SET address_2 = COALESCE(address_2, metadata ->> 'address_2')
WHERE metadata ? 'address_2'
  AND (metadata ->> 'address_2') <> '';

UPDATE contacts
SET city = COALESCE(city, metadata ->> 'city')
WHERE metadata ? 'city'
  AND (metadata ->> 'city') <> '';

UPDATE contacts
SET state = COALESCE(state, metadata ->> 'state')
WHERE metadata ? 'state'
  AND (metadata ->> 'state') <> '';

UPDATE contacts
SET zip = COALESCE(zip, metadata ->> 'zip')
WHERE metadata ? 'zip'
  AND (metadata ->> 'zip') <> '';

UPDATE contacts
SET country = COALESCE(country, metadata ->> 'country')
WHERE metadata ? 'country'
  AND (metadata ->> 'country') <> '';

-- Backfill tags from old JSONB column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contacts' AND column_name = 'tags_jsonb_old'
  ) THEN
    UPDATE contacts
    SET tags = ARRAY(SELECT jsonb_array_elements_text(tags_jsonb_old))
    WHERE (tags IS NULL OR tags = '{}'::text[])
      AND tags_jsonb_old IS NOT NULL
      AND jsonb_typeof(tags_jsonb_old) = 'array';
  END IF;
END $$;

-- Backfill tags from metadata
UPDATE contacts
SET tags = ARRAY(SELECT jsonb_array_elements_text(metadata -> 'tags'))
WHERE (tags IS NULL OR tags = '{}'::text[])
  AND metadata ? 'tags'
  AND jsonb_typeof(metadata -> 'tags') = 'array';

UPDATE contacts
SET metadata = COALESCE(metadata, '{}'::jsonb)
               - 'mobile' - 'lead_source'
               - 'address_1' - 'address_2' - 'city' - 'state' - 'zip' - 'country'
               - 'tags'
WHERE metadata ?| ARRAY['mobile','lead_source','address_1','address_2','city','state','zip','country','tags'];

-- ---------------------------------------------------------------------------
-- Opportunities
-- ---------------------------------------------------------------------------
ALTER TABLE opportunities
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_source TEXT,
  ADD COLUMN IF NOT EXISTS type TEXT,
  ADD COLUMN IF NOT EXISTS competitor TEXT;

-- Handle tags column: if it exists as JSONB, rename it and create new TEXT[] column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'tags' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE opportunities RENAME COLUMN tags TO tags_jsonb_old;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'tags' AND udt_name = '_text'
  ) THEN
    ALTER TABLE opportunities ADD COLUMN tags TEXT[] DEFAULT '{}'::text[];
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_opportunities_lead_id ON opportunities(tenant_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_opportunities_type ON opportunities(tenant_id, type) WHERE type IS NOT NULL;

UPDATE opportunities
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

UPDATE opportunities
SET lead_id = COALESCE(lead_id, (metadata ->> 'lead_id')::uuid)
WHERE metadata ? 'lead_id'
  AND (metadata ->> 'lead_id') ~ '^[0-9a-fA-F-]{36}$';

UPDATE opportunities
SET lead_source = COALESCE(lead_source, metadata ->> 'lead_source')
WHERE metadata ? 'lead_source'
  AND (metadata ->> 'lead_source') <> '';

UPDATE opportunities
SET type = COALESCE(type, metadata ->> 'type')
WHERE metadata ? 'type'
  AND (metadata ->> 'type') <> '';

UPDATE opportunities
SET competitor = COALESCE(competitor, metadata ->> 'competitor')
WHERE metadata ? 'competitor'
  AND (metadata ->> 'competitor') <> '';

-- Backfill tags from old JSONB column if it exists
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'opportunities' AND column_name = 'tags_jsonb_old'
  ) THEN
    UPDATE opportunities
    SET tags = ARRAY(SELECT jsonb_array_elements_text(tags_jsonb_old))
    WHERE (tags IS NULL OR tags = '{}'::text[])
      AND tags_jsonb_old IS NOT NULL
      AND jsonb_typeof(tags_jsonb_old) = 'array';
  END IF;
END $$;

-- Backfill tags from metadata
UPDATE opportunities
SET tags = ARRAY(SELECT jsonb_array_elements_text(metadata -> 'tags'))
WHERE (tags IS NULL OR tags = '{}'::text[])
  AND metadata ? 'tags'
  AND jsonb_typeof(metadata -> 'tags') = 'array';

UPDATE opportunities
SET metadata = COALESCE(metadata, '{}'::jsonb)
               - 'lead_id' - 'lead_source' - 'type' - 'competitor' - 'tags'
WHERE metadata ?| ARRAY['lead_id','lead_source','type','competitor','tags'];

-- ---------------------------------------------------------------------------
-- Activities
-- ---------------------------------------------------------------------------
ALTER TABLE activities
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'scheduled',
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS outcome TEXT,
  ADD COLUMN IF NOT EXISTS ai_call_config JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS ai_email_config JSONB DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_activities_duration ON activities(tenant_id, duration_minutes) WHERE duration_minutes IS NOT NULL;

UPDATE activities
SET metadata = '{}'::jsonb
WHERE metadata IS NULL;

UPDATE activities
SET status = COALESCE(status, metadata ->> 'status')
WHERE metadata ? 'status'
  AND (metadata ->> 'status') <> '';

UPDATE activities
SET duration_minutes = COALESCE(
      duration_minutes,
      CASE
        WHEN (metadata ->> 'duration') ~ '^-?\\d+$' THEN (metadata ->> 'duration')::integer
        WHEN (metadata ->> 'duration_minutes') ~ '^-?\\d+$' THEN (metadata ->> 'duration_minutes')::integer
        ELSE NULL
      END)
WHERE metadata ?| ARRAY['duration','duration_minutes'];

UPDATE activities
SET outcome = COALESCE(outcome, metadata ->> 'outcome')
WHERE metadata ? 'outcome'
  AND (metadata ->> 'outcome') <> '';

UPDATE activities
SET ai_call_config = COALESCE(NULLIF(ai_call_config, '{}'), metadata -> 'ai_call_config')
WHERE metadata ? 'ai_call_config'
  AND jsonb_typeof(metadata -> 'ai_call_config') = 'object';

UPDATE activities
SET ai_email_config = COALESCE(NULLIF(ai_email_config, '{}'), metadata -> 'ai_email_config')
WHERE metadata ? 'ai_email_config'
  AND jsonb_typeof(metadata -> 'ai_email_config') = 'object';

UPDATE activities
SET metadata = COALESCE(metadata, '{}'::jsonb)
               - 'status' - 'duration' - 'duration_minutes' - 'outcome'
               - 'ai_call_config' - 'ai_email_config'
WHERE metadata ?| ARRAY['status','duration','duration_minutes','outcome','ai_call_config','ai_email_config'];

COMMIT;
