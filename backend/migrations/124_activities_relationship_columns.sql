-- Migration 124: Add relationship columns to activities table
-- Issue: Activities table missing account_id, contact_id, lead_id, opportunity_id
-- These are standard CRM relationships for activities

-- Add relationship columns to activities
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS contact_id UUID REFERENCES public.contacts(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL;

-- Add indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_activities_account_id ON public.activities(account_id) WHERE account_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_contact_id ON public.activities(contact_id) WHERE contact_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_lead_id ON public.activities(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_opportunity_id ON public.activities(opportunity_id) WHERE opportunity_id IS NOT NULL;

-- Add assignment/ownership columns if they don't exist
ALTER TABLE public.activities
  ADD COLUMN IF NOT EXISTS assigned_to TEXT,
  ADD COLUMN IF NOT EXISTS owner_id UUID;

-- Indexes for assignment queries
CREATE INDEX IF NOT EXISTS idx_activities_assigned_to ON public.activities(assigned_to) WHERE assigned_to IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_activities_owner_id ON public.activities(owner_id) WHERE owner_id IS NOT NULL;

COMMENT ON COLUMN public.activities.account_id IS 'Related account for this activity';
COMMENT ON COLUMN public.activities.contact_id IS 'Related contact for this activity';
COMMENT ON COLUMN public.activities.lead_id IS 'Related lead for this activity';
COMMENT ON COLUMN public.activities.opportunity_id IS 'Related opportunity for this activity';
COMMENT ON COLUMN public.activities.assigned_to IS 'User or team assigned to complete this activity';
COMMENT ON COLUMN public.activities.owner_id IS 'User who owns this activity';
