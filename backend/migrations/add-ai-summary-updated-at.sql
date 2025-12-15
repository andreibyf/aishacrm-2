-- Add ai_summary_updated_at column to person_profile table
-- This column tracks when the AI summary was last generated/updated
-- Used for caching logic to avoid re-generating summaries within 24 hours

ALTER TABLE public.person_profile
ADD COLUMN IF NOT EXISTS ai_summary_updated_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add index for faster filtering on cache validation
CREATE INDEX IF NOT EXISTS idx_person_profile_ai_summary_updated_at 
ON public.person_profile(ai_summary_updated_at DESC NULLS LAST);

-- If there are existing ai_summary values without timestamps, set them to now()
UPDATE public.person_profile
SET ai_summary_updated_at = CURRENT_TIMESTAMP
WHERE ai_summary IS NOT NULL AND ai_summary_updated_at IS NULL;
