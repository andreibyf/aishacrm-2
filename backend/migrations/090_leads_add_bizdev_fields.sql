-- Migration: 090_leads_add_bizdev_fields.sql
-- Purpose: Add BizDev Source provenance fields to leads table for v3.0.0 architecture
-- 
-- ARCHITECTURAL NOTE (v3.0.0):
-- - Leads table remains minimal: id, tenant_id, account_id, person_id, lead_type
-- - Company/organization data (company_name, industry, website) → accounts table
-- - Person data (contact_person, email, phone) → person_profile table
-- - BizDev Source provenance tracking → leads metadata + foreign key reference
--
-- This migration ONLY adds provenance tracking to leads, NOT company/person fields.
-- See orchestral/PLAN.md and "Database Revamp for New Workflow.md" for full schema design.

BEGIN;

-- Provenance tracking: which BizDev Source this Lead was promoted from
ALTER TABLE leads ADD COLUMN IF NOT EXISTS promoted_from_bizdev_source_id UUID 
  REFERENCES bizdev_sources(id) ON DELETE SET NULL;

-- Timestamp when promotion occurred (for audit trail)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ;

-- Index for performance on promotion lookups
CREATE INDEX IF NOT EXISTS idx_leads_promoted_from_bizdev 
  ON leads(promoted_from_bizdev_source_id)
  WHERE promoted_from_bizdev_source_id IS NOT NULL;

COMMIT;
