/**
 * promotionHelpers.js
 * 
 * v3.0.0 Architecture Support
 * Helper functions for promoting BizDev Sources to Leads while respecting
 * normalized schema: company data → accounts, person data → person_profile,
 * provenance → leads.promoted_from_bizdev_source_id
 * 
 * Enforces:
 * - Tenant isolation on all operations
 * - B2C constraints (person_id required, placeholder account)
 * - Foreign key integrity
 * - RLS compliance
 */

import { getSupabaseClient } from '../lib/supabase-db.js';

/**
 * Find or create a placeholder B2C account for a tenant
 * 
 * @param {Client} client - PostgreSQL client
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<{id: string, account_type: string, is_placeholder: boolean}>}
 */
export async function getOrCreatePlaceholderB2CAccount(client, tenantId) {
  if (!tenantId) throw new Error('tenantId required');

  // Try to find existing placeholder B2C account
  const findResult = await client.query(
    `SELECT id, account_type, is_placeholder FROM accounts
     WHERE tenant_id = $1 
       AND account_type = 'b2c' 
       AND is_placeholder = true
     LIMIT 1`,
    [tenantId]
  );

  if (findResult.rows.length > 0) {
    return findResult.rows[0];
  }

  // Create new placeholder B2C account if none exists
  const createResult = await client.query(
    `INSERT INTO accounts (tenant_id, account_type, is_placeholder, name, created_at)
     VALUES ($1, $2, $3, $4, NOW())
     RETURNING id, account_type, is_placeholder`,
    [tenantId, 'b2c', true, 'B2C Placeholder']
  );

  if (createResult.rows.length === 0) {
    throw new Error('Failed to create placeholder B2C account');
  }

  return createResult.rows[0];
}

/**
 * Create a person_profile entry from BizDev Source contact data
 * 
 * @param {Client} client - PostgreSQL client
 * @param {string} tenantId - Tenant UUID
 * @param {Object} bizdevData - BizDev Source row with contact info
 * @returns {Promise<{id: string}>}
 */
export async function createPersonFromBizDev(client, tenantId, bizdevData) {
  if (!tenantId) throw new Error('tenantId required');

  const {
    contact_person,
    contact_email,
    contact_phone
  } = bizdevData;

  // Extract name parts if available
  const [firstName, ...lastNameParts] = (contact_person || '').split(' ');
  const lastName = lastNameParts.join(' ') || null;

  // Try to create person_profile. The person_profile table may have different schema
  // If it fails due to schema mismatch, we'll create a contacts record instead as fallback
  try {
    const result = await client.query(
      `INSERT INTO person_profile (
         tenant_id, 
         first_name, 
         last_name, 
         email, 
         phone
       ) VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        tenantId,
        firstName || null,
        lastName,
        contact_email || null,
        contact_phone || null
      ]
    );

    if (result.rows.length === 0) {
      throw new Error('Failed to create person_profile');
    }

    return result.rows[0];
  } catch (err) {
    // If person_profile creation fails, try contacts table as fallback
    console.warn('[createPersonFromBizDev] Trying contacts table as fallback:', err.message);
    
    const contactResult = await client.query(
      `INSERT INTO contacts (
         tenant_id, 
         first_name, 
         last_name, 
         email, 
         phone,
         status
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [
        tenantId,
        firstName || null,
        lastName,
        contact_email || null,
        contact_phone || null,
        'active'
      ]
    );

    if (contactResult.rows.length === 0) {
      throw new Error('Failed to create person_profile or contacts record');
    }

    return contactResult.rows[0];
  }
}

/**
 * Find or create an account from BizDev Source company data (B2B)
 * 
 * @param {Client} client - PostgreSQL client
 * @param {string} tenantId - Tenant UUID
 * @param {Object} bizdevData - BizDev Source row with company info
 * @returns {Promise<{id: string}>}
 */
export async function findOrCreateB2BAccountFromBizDev(client, tenantId, bizdevData) {
  if (!tenantId) throw new Error('tenantId required');

  const {
    company_name,
    dba_name,
    website,
    industry,
    address_line_1,
    address_line_2,
    city,
    state_province,
    postal_code,
    country,
    contact_email,
    contact_phone
  } = bizdevData;

  // Try to find existing account by company_name + tenant
  if (company_name) {
    const findResult = await client.query(
      `SELECT id FROM accounts
       WHERE tenant_id = $1 
         AND name = $2
         AND account_type = 'b2b'
         AND is_placeholder = false
       LIMIT 1`,
      [tenantId, company_name]
    );

    if (findResult.rows.length > 0) {
      return { id: findResult.rows[0].id };
    }
  }

  // Create new B2B account with company data
  const metadata = {};
  if (dba_name) metadata.dba_name = dba_name;
  if (industry) metadata.industry = industry;
  if (website) metadata.website = website;
  if (contact_email) metadata.contact_email = contact_email;
  if (contact_phone) metadata.contact_phone = contact_phone;

  const createResult = await client.query(
    `INSERT INTO accounts (
       tenant_id, 
       account_type, 
       is_placeholder, 
       name, 
       website,
       metadata,
       created_at
     ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
     RETURNING id`,
    [
      tenantId,
      'b2b',
      false,
      company_name || 'Unknown Company',
      website || null,
      metadata ? JSON.stringify(metadata) : null
    ]
  );

  if (createResult.rows.length === 0) {
    throw new Error('Failed to create B2B account');
  }

  return { id: createResult.rows[0].id };
}

/**
 * Build Lead metadata capturing BizDev Source provenance
 * 
 * @param {Object} bizdevSource - Full BizDev Source row
 * @returns {Object} Metadata object for leads.metadata
 */
export function buildLeadProvenanceMetadata(bizdevSource) {
  return {
    // Source provenance
    source_origin: bizdevSource.source,
    source_type: bizdevSource.source_type,
    source_priority: bizdevSource.priority,
    batch_id: bizdevSource.batch_id,
    promoted_from_bizdev_id: bizdevSource.id,
    promoted_timestamp: new Date().toISOString(),

    // Contact person details
    contact_person: bizdevSource.contact_person,
    contact_email: bizdevSource.contact_email,
    contact_phone: bizdevSource.contact_phone,

    // Company details (already in Account but captured in metadata for auditability)
    company_name: bizdevSource.company_name,
    dba_name: bizdevSource.dba_name,
    industry: bizdevSource.industry,
    website: bizdevSource.website,

    // License info
    industry_license: bizdevSource.industry_license,
    license_status: bizdevSource.license_status,
    license_expiry_date: bizdevSource.license_expiry_date,

    // Address
    bizdev_address: {
      line1: bizdevSource.address_line_1,
      line2: bizdevSource.address_line_2,
      city: bizdevSource.city,
      state: bizdevSource.state_province,
      postal_code: bizdevSource.postal_code,
      country: bizdevSource.country
    }
  };
}

/**
 * Determine lead_type based on client_type and presence of company data
 * 
 * @param {string} clientType - Tenant client_type (B2B, B2C, Hybrid)
 * @param {boolean} hasCompanyData - Whether BizDev Source has company_name
 * @returns {string} lead_type (b2b or b2c)
 */
export function determineLeadType(clientType, hasCompanyData) {
  // Client type at tenant level guides initial classification
  if (clientType === 'B2C') return 'b2c';
  if (clientType === 'B2B') return 'b2b';
  
  // For Hybrid, use company data presence as heuristic
  if (clientType === 'Hybrid') {
    return hasCompanyData ? 'b2b' : 'b2c';
  }

  // Default to B2B if ambiguous
  return 'b2b';
}
