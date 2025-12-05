-- Migration 090: Add performance_metrics column to ai_campaign table
-- Required by backend/routes/aicampaigns.js for campaign statistics tracking

BEGIN;

-- Add performance_metrics JSONB column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_campaign' 
        AND column_name = 'performance_metrics'
    ) THEN
        ALTER TABLE ai_campaign 
        ADD COLUMN performance_metrics JSONB DEFAULT '{}';
        
        COMMENT ON COLUMN ai_campaign.performance_metrics IS 
            'Aggregated campaign performance metrics: total_calls, successful_calls, failed_calls, appointments_set, leads_qualified, average_duration';
    END IF;
END $$;

-- Also add target_contacts and description if missing (used by aicampaigns.js)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_campaign' 
        AND column_name = 'target_contacts'
    ) THEN
        ALTER TABLE ai_campaign 
        ADD COLUMN target_contacts JSONB DEFAULT '[]';
        
        COMMENT ON COLUMN ai_campaign.target_contacts IS 
            'Array of contact IDs targeted by this campaign';
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ai_campaign' 
        AND column_name = 'description'
    ) THEN
        ALTER TABLE ai_campaign 
        ADD COLUMN description TEXT;
        
        COMMENT ON COLUMN ai_campaign.description IS 
            'Campaign description or notes';
    END IF;
END $$;

COMMIT;
