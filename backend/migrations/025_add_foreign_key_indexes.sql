-- ============================================
-- PERFORMANCE: Add Missing Foreign Key Indexes
-- ============================================
-- Supabase Linter Recommendation: Add indexes on foreign key columns
-- to improve JOIN query performance.
--
-- These indexes will speed up queries that join related tables.

-- ============================================
-- Fix: cash_flow table
-- ============================================
-- Add index on account_id foreign key
CREATE INDEX IF NOT EXISTS idx_cash_flow_account_id 
ON public.cash_flow(account_id);

COMMENT ON INDEX idx_cash_flow_account_id IS 
'Performance index for cash_flow.account_id foreign key (joins with accounts table)';

-- ============================================
-- Fix: contacts table
-- ============================================
-- Add index on account_id foreign key
CREATE INDEX IF NOT EXISTS idx_contacts_account_id 
ON public.contacts(account_id);

COMMENT ON INDEX idx_contacts_account_id IS 
'Performance index for contacts.account_id foreign key (joins with accounts table)';

-- ============================================
-- Fix: opportunities table
-- ============================================
-- Add index on account_id foreign key
CREATE INDEX IF NOT EXISTS idx_opportunities_account_id 
ON public.opportunities(account_id);

COMMENT ON INDEX idx_opportunities_account_id IS 
'Performance index for opportunities.account_id foreign key (joins with accounts table)';

-- Add index on contact_id foreign key
CREATE INDEX IF NOT EXISTS idx_opportunities_contact_id 
ON public.opportunities(contact_id);

COMMENT ON INDEX idx_opportunities_contact_id IS 
'Performance index for opportunities.contact_id foreign key (joins with contacts table)';

-- ============================================
-- Fix: subscription table
-- ============================================
-- Add index on plan_id foreign key
CREATE INDEX IF NOT EXISTS idx_subscription_plan_id 
ON public.subscription(plan_id);

COMMENT ON INDEX idx_subscription_plan_id IS 
'Performance index for subscription.plan_id foreign key (joins with subscription_plan table)';

-- ============================================
-- VERIFICATION
-- ============================================
-- List all indexes created for foreign keys
SELECT 
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('cash_flow', 'contacts', 'opportunities', 'subscription')
  AND indexname IN (
    'idx_cash_flow_account_id',
    'idx_contacts_account_id', 
    'idx_opportunities_account_id',
    'idx_opportunities_contact_id',
    'idx_subscription_plan_id'
  )
ORDER BY tablename, indexname;

-- Expected: 5 indexes listed
