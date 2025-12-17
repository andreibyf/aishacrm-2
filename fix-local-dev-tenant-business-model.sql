-- Fix Local Development tenant to be B2C
-- This script updates the tenant metadata to set business_model to 'b2c'

UPDATE tenant 
SET metadata = jsonb_set(
  COALESCE(metadata, '{}'::jsonb), 
  '{business_model}', 
  '"b2c"'
)
WHERE id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';

-- Verify the update
SELECT id, name, metadata->>'business_model' as business_model 
FROM tenant 
WHERE id = 'a11dfb63-4b18-4eb8-872e-747af2e37c46';
