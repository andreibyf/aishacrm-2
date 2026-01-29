/**
 * conversionHelpers.js
 * 
 * v3.0.0 Architecture Support - Phase 2
 * Helper functions for converting Leads to Contacts while maintaining
 * lifecycle provenance and entity relationships.
 * 
 * Enforces:
 * - Tenant isolation on all operations
 * - Account relationship preservation
 * - Provenance tracking (lead_id in contact metadata)
 * - RLS compliance
 */

/**
 * Extract person data from a Lead to prepare Contact creation
 * Handles both B2B (minimal person data) and B2C (full person data) leads
 * 
 * @param {Object} lead - Lead row from database
 * @returns {Object} Person data ready for Contact insertion
 */
export function extractPersonDataFromLead(lead) {
  return {
    first_name: lead.first_name,
    last_name: lead.last_name,
    email: lead.email,
    phone: lead.phone,
    job_title: lead.job_title
  };
}

/**
 * Build Contact metadata capturing Lead provenance and conversion context
 * 
 * @param {Object} lead - Full Lead row
 * @returns {Object} Metadata object for contacts.metadata
 */
export function buildContactProvenanceMetadata(lead) {
  return {
    // Conversion provenance
    converted_from_lead_id: lead.id,
    converted_at: new Date().toISOString(),
    converted_from_lead_type: lead.lead_type,
    
    // Original lead context (for audit trail)
    lead_source: lead.source,
    lead_status: lead.status,
    
    // BizDev lineage (if this lead was promoted from BizDev)
    bizdev_origin: lead.metadata?.promoted_from_bizdev_id,
    bizdev_source_info: lead.metadata?.source_origin,
    bizdev_batch_id: lead.metadata?.batch_id,
    
    // Company context (useful for B2B follow-ups)
    company_name: lead.company_name,
    industry: lead.industry,
    website: lead.website,
    
    // License info (if applicable)
    industry_license: lead.industry_license,
    license_status: lead.license_status,
    
    // Full lead metadata snapshot for auditability
    lead_metadata_snapshot: lead.metadata
  };
}

/**
 * Determine conversion outcome: should this Lead be deleted, archived, or linked?
 * Default: mark as converted, keep for audit trail
 * 
 * @param {string} leadStatus - Current lead status
 * @returns {Object} Conversion action instructions
 */
export function determineConversionAction(_leadStatus) {
  return {
    mark_as_converted: true,
    new_status: 'converted',
    delete_lead: false,  // Default: preserve for audit
    archive_lead: false
  };
}

/**
 * Validate Lead can be converted to Contact
 * Checks:
 * - Lead has at least name or email
 * - Lead is not already converted
 * 
 * @param {Object} lead - Lead row
 * @returns {{valid: boolean, error?: string}}
 */
export function validateLeadConversion(lead) {
  if (!lead) {
    return { valid: false, error: 'Lead not found' };
  }

  if (lead.status === 'converted') {
    return { valid: false, error: 'Lead already converted to Contact' };
  }

  // Must have at least name or email
  const hasIdentifier = !!(lead.first_name || lead.last_name || lead.email);
  if (!hasIdentifier) {
    return { valid: false, error: 'Lead must have first_name, last_name, or email' };
  }

  return { valid: true };
}

/**
 * Determine B2B vs B2C for Contact (same logic as Lead determination)
 * 
 * @param {string} leadType - From lead.lead_type (b2b or b2c)
 * @returns {string} Contact classification (b2b or b2c)
 */
export function determineContactType(leadType) {
  return leadType === 'b2c' ? 'b2c' : 'b2b';
}
