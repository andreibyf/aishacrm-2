-- ========================================
-- Entity Lifecycle with ID Preservation
-- ========================================
-- This migration implements proper entity lifecycle management where IDs are preserved
-- when entities are converted/promoted to avoid double-counting and maintain continuity.
--
-- Key Principles:
-- 1. Lead → Contact: Lead ID becomes Contact ID (transfer, not copy)
-- 2. BizDev Source → Account: BizDev ID becomes Account ID (promotion, not duplication)
-- 3. All relationships use UUID foreign keys (not TEXT)
-- 4. History is tracked via status changes and metadata, not duplicate records
--
-- CRITICAL: Run 032_normalize_foreign_keys.sql FIRST if not already applied

-- ========================================
-- STEP 1: Add lifecycle status tracking
-- ========================================

-- Add lifecycle status to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active';
-- Possible values: 'active', 'converted_to_contact', 'archived', 'duplicate'

-- Add lifecycle status to bizdev_sources table
ALTER TABLE bizdev_sources ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active';
-- Possible values: 'active', 'promoted_to_account', 'archived', 'duplicate'

-- Add lifecycle tracking to contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS converted_from_lead_id UUID;
-- Possible values: 'active', 'archived', 'duplicate', 'converted_from_lead'

-- Add lifecycle tracking to accounts
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS lifecycle_status TEXT DEFAULT 'active';
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS promoted_from_bizdev_id UUID;
-- Possible values: 'active', 'archived', 'duplicate', 'promoted_from_bizdev'

-- ========================================
-- STEP 2: Create entity_lifecycle_log table
-- ========================================
-- This tracks the complete history of entity transformations

CREATE TABLE IF NOT EXISTS entity_lifecycle_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL, -- Will be converted to FK in next migration
  
  -- Source entity
  source_entity_type TEXT NOT NULL, -- 'lead', 'bizdev_source', etc.
  source_entity_id UUID NOT NULL,
  
  -- Target entity
  target_entity_type TEXT NOT NULL, -- 'contact', 'account', etc.
  target_entity_id UUID NOT NULL,
  
  -- Transformation details
  transformation_type TEXT NOT NULL, -- 'convert', 'promote', 'merge', 'split'
  
  -- Data snapshot (preserves original state)
  source_data_snapshot JSONB NOT NULL,
  
  -- Metadata
  performed_by TEXT, -- user email
  reason TEXT,
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_entity_lifecycle_log_tenant ON entity_lifecycle_log(tenant_id);
CREATE INDEX idx_entity_lifecycle_log_source ON entity_lifecycle_log(source_entity_type, source_entity_id);
CREATE INDEX idx_entity_lifecycle_log_target ON entity_lifecycle_log(target_entity_type, target_entity_id);
CREATE INDEX idx_entity_lifecycle_log_transformation ON entity_lifecycle_log(transformation_type);

-- ========================================
-- STEP 3: Add indexes for lifecycle queries
-- ========================================

CREATE INDEX idx_leads_lifecycle_status ON leads(lifecycle_status, tenant_id);
CREATE INDEX idx_bizdev_sources_lifecycle_status ON bizdev_sources(lifecycle_status, tenant_id);
CREATE INDEX idx_contacts_lifecycle_status ON contacts(lifecycle_status, tenant_id);
CREATE INDEX idx_contacts_converted_from ON contacts(converted_from_lead_id) WHERE converted_from_lead_id IS NOT NULL;
CREATE INDEX idx_accounts_lifecycle_status ON accounts(lifecycle_status, tenant_id);
CREATE INDEX idx_accounts_promoted_from ON accounts(promoted_from_bizdev_id) WHERE promoted_from_bizdev_id IS NOT NULL;

-- ========================================
-- STEP 4: Create functions for ID-preserving conversions
-- ========================================

-- Function: Convert Lead to Contact (preserving ID)
CREATE OR REPLACE FUNCTION convert_lead_to_contact(
  p_lead_id UUID,
  p_tenant_id UUID,
  p_account_id UUID DEFAULT NULL,
  p_performed_by TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_lead_data JSONB;
  v_contact_id UUID;
BEGIN
  -- Get lead data
  SELECT to_jsonb(leads.*) INTO v_lead_data
  FROM leads
  WHERE id = p_lead_id AND tenant_id = p_tenant_id AND lifecycle_status = 'active';
  
  IF v_lead_data IS NULL THEN
    RAISE EXCEPTION 'Lead not found or already converted: %', p_lead_id;
  END IF;
  
  -- Use the lead's ID as the contact ID
  v_contact_id := p_lead_id;
  
  -- Create contact with same ID
  INSERT INTO contacts (
    id,
    tenant_id,
    first_name,
    last_name,
    email,
    phone,
    account_id,
    lifecycle_status,
    converted_from_lead_id,
    metadata,
    created_at
  ) VALUES (
    v_contact_id,
    p_tenant_id,
    v_lead_data->>'first_name',
    v_lead_data->>'last_name',
    v_lead_data->>'email',
    v_lead_data->>'phone',
    p_account_id,
    'converted_from_lead',
    p_lead_id,
    jsonb_build_object(
      'converted_from_lead', true,
      'original_lead_data', v_lead_data,
      'original_company', v_lead_data->>'company',
      'original_status', v_lead_data->>'status'
    ),
    COALESCE((v_lead_data->>'created_at')::timestamptz, now())
  );
  
  -- Mark lead as converted (don't delete, preserve history)
  UPDATE leads
  SET lifecycle_status = 'converted_to_contact',
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{converted_to_contact_id}',
        to_jsonb(v_contact_id::text)
      ),
      updated_at = now()
  WHERE id = p_lead_id;
  
  -- Log the transformation
  INSERT INTO entity_lifecycle_log (
    tenant_id,
    source_entity_type,
    source_entity_id,
    target_entity_type,
    target_entity_id,
    transformation_type,
    source_data_snapshot,
    performed_by,
    notes
  ) VALUES (
    p_tenant_id,
    'lead',
    p_lead_id,
    'contact',
    v_contact_id,
    'convert',
    v_lead_data,
    p_performed_by,
    'Lead converted to contact with ID preservation'
  );
  
  RETURN v_contact_id;
END;
$$ LANGUAGE plpgsql;

-- Function: Promote BizDev Source to Account (preserving ID)
CREATE OR REPLACE FUNCTION promote_bizdev_to_account(
  p_bizdev_id UUID,
  p_tenant_id UUID,
  p_account_name TEXT DEFAULT NULL,
  p_performed_by TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  v_bizdev_data JSONB;
  v_account_id UUID;
  v_account_name TEXT;
BEGIN
  -- Get bizdev source data
  SELECT to_jsonb(bizdev_sources.*) INTO v_bizdev_data
  FROM bizdev_sources
  WHERE id = p_bizdev_id AND tenant_id = p_tenant_id AND lifecycle_status = 'active';
  
  IF v_bizdev_data IS NULL THEN
    RAISE EXCEPTION 'BizDev source not found or already promoted: %', p_bizdev_id;
  END IF;
  
  -- Use the bizdev's ID as the account ID
  v_account_id := p_bizdev_id;
  
  -- Determine account name
  v_account_name := COALESCE(
    p_account_name,
    v_bizdev_data->>'company_name',
    v_bizdev_data->>'source_name',
    v_bizdev_data->>'source',
    'Account ' || SUBSTRING(p_bizdev_id::text, 1, 8)
  );
  
  -- Create account with same ID
  INSERT INTO accounts (
    id,
    tenant_id,
    name,
    industry,
    website,
    lifecycle_status,
    promoted_from_bizdev_id,
    metadata,
    created_at
  ) VALUES (
    v_account_id,
    p_tenant_id,
    v_account_name,
    v_bizdev_data->>'industry',
    COALESCE(v_bizdev_data->>'website', v_bizdev_data->>'source_url'),
    'promoted_from_bizdev',
    p_bizdev_id,
    jsonb_build_object(
      'promoted_from_bizdev', true,
      'original_bizdev_data', v_bizdev_data,
      'original_source_type', v_bizdev_data->>'source_type',
      'original_priority', v_bizdev_data->>'priority',
      'leads_generated', v_bizdev_data->>'leads_generated',
      'opportunities_created', v_bizdev_data->>'opportunities_created',
      'revenue_generated', v_bizdev_data->>'revenue_generated'
    ),
    COALESCE((v_bizdev_data->>'created_at')::timestamptz, now())
  );
  
  -- Mark bizdev source as promoted (don't delete, preserve history)
  UPDATE bizdev_sources
  SET lifecycle_status = 'promoted_to_account',
      metadata = jsonb_set(
        COALESCE(metadata, '{}'::jsonb),
        '{promoted_to_account_id}',
        to_jsonb(v_account_id::text)
      ),
      updated_at = now()
  WHERE id = p_bizdev_id;
  
  -- Log the transformation
  INSERT INTO entity_lifecycle_log (
    tenant_id,
    source_entity_type,
    source_entity_id,
    target_entity_type,
    target_entity_id,
    transformation_type,
    source_data_snapshot,
    performed_by,
    notes
  ) VALUES (
    p_tenant_id,
    'bizdev_source',
    p_bizdev_id,
    'account',
    v_account_id,
    'promote',
    v_bizdev_data,
    p_performed_by,
    'BizDev source promoted to account with ID preservation'
  );
  
  RETURN v_account_id;
END;
$$ LANGUAGE plpgsql;

-- ========================================
-- STEP 5: Create views for active entities
-- ========================================
-- These views automatically filter out converted/promoted entities

CREATE OR REPLACE VIEW active_leads AS
SELECT * FROM leads
WHERE lifecycle_status = 'active';

CREATE OR REPLACE VIEW active_bizdev_sources AS
SELECT * FROM bizdev_sources
WHERE lifecycle_status = 'active';

CREATE OR REPLACE VIEW active_contacts AS
SELECT * FROM contacts
WHERE lifecycle_status IN ('active', 'converted_from_lead');

CREATE OR REPLACE VIEW active_accounts AS
SELECT * FROM accounts
WHERE lifecycle_status IN ('active', 'promoted_from_bizdev');

-- ========================================
-- STEP 6: Create helper views for reporting
-- ========================================

-- View: Lead Conversion Tracking
CREATE OR REPLACE VIEW lead_conversion_tracking AS
SELECT 
  l.id as lead_id,
  l.first_name || ' ' || l.last_name as lead_name,
  l.email as lead_email,
  l.company as lead_company,
  l.created_at as lead_created_at,
  c.id as contact_id,
  c.first_name || ' ' || c.last_name as contact_name,
  c.email as contact_email,
  c.account_id,
  a.name as account_name,
  ell.created_at as converted_at,
  ell.performed_by as converted_by
FROM leads l
LEFT JOIN entity_lifecycle_log ell ON 
  ell.source_entity_type = 'lead' AND 
  ell.source_entity_id = l.id AND 
  ell.transformation_type = 'convert'
LEFT JOIN contacts c ON c.id = ell.target_entity_id
LEFT JOIN accounts a ON a.id = c.account_id
WHERE l.lifecycle_status = 'converted_to_contact';

-- View: BizDev Promotion Tracking
CREATE OR REPLACE VIEW bizdev_promotion_tracking AS
SELECT 
  bs.id as bizdev_id,
  COALESCE(bs.company_name, bs.source_name, bs.source) as bizdev_name,
  bs.source_type,
  bs.industry,
  bs.leads_generated,
  bs.opportunities_created,
  bs.revenue_generated,
  bs.created_at as bizdev_created_at,
  a.id as account_id,
  a.name as account_name,
  a.website as account_website,
  ell.created_at as promoted_at,
  ell.performed_by as promoted_by
FROM bizdev_sources bs
LEFT JOIN entity_lifecycle_log ell ON 
  ell.source_entity_type = 'bizdev_source' AND 
  ell.source_entity_id = bs.id AND 
  ell.transformation_type = 'promote'
LEFT JOIN accounts a ON a.id = ell.target_entity_id
WHERE bs.lifecycle_status = 'promoted_to_account';

-- ========================================
-- STEP 7: Create triggers for automatic orphan prevention
-- ========================================

-- Trigger: Prevent deletion of converted leads
CREATE OR REPLACE FUNCTION prevent_converted_entity_deletion()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.lifecycle_status IN ('converted_to_contact', 'promoted_to_account') THEN
    RAISE EXCEPTION 'Cannot delete converted/promoted entity. Archive instead.';
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_lead_deletion
BEFORE DELETE ON leads
FOR EACH ROW
EXECUTE FUNCTION prevent_converted_entity_deletion();

CREATE TRIGGER prevent_bizdev_deletion
BEFORE DELETE ON bizdev_sources
FOR EACH ROW
EXECUTE FUNCTION prevent_converted_entity_deletion();

-- ========================================
-- MIGRATION COMPLETE
-- ========================================
-- Summary:
-- 1. lifecycle_status columns added to all entity tables
-- 2. ID preservation functions created for conversions
-- 3. entity_lifecycle_log table tracks all transformations
-- 4. Views provide filtered access to active entities
-- 5. Triggers prevent accidental deletion of converted entities
-- 6. No more double-counting - IDs are preserved through lifecycle
