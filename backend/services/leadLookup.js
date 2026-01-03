/**
 * Lead Lookup Service
 * 
 * Finds leads by name using fuzzy matching against the database.
 */

import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

/**
 * @typedef {Object} Lead
 * @property {string} id - Lead UUID
 * @property {string} name - Lead name
 * @property {string} [email] - Lead email
 * @property {string} [phone] - Lead phone number
 * @property {string} tenant_id - Tenant UUID
 */

/**
 * Find a lead by name within a tenant
 * 
 * @param {string} tenantId - Tenant UUID
 * @param {string} name - Name to search for (partial match)
 * @returns {Promise<Lead | null>}
 */
export async function findLeadByName(tenantId, name) {
  const supa = getSupabaseClient();
  const searchTerm = name.trim().toLowerCase();
  
  // First try exact match (case-insensitive)
  const { data: exactMatch, error: exactError } = await supa
    .from('leads')
    .select('id, name, email, phone, tenant_id')
    .eq('tenant_id', tenantId)
    .ilike('name', searchTerm)
    .limit(1)
    .maybeSingle();
  
  if (!exactError && exactMatch) {
    return exactMatch;
  }
  
  // Then try partial match
  const { data: partialMatches, error: partialError } = await supa
    .from('leads')
    .select('id, name, email, phone, tenant_id')
    .eq('tenant_id', tenantId)
    .ilike('name', `%${searchTerm}%`)
    .limit(5);
  
  if (partialError) {
    logger.error('[LeadLookup] Error searching leads:', partialError.message);
    return null;
  }
  
  if (!partialMatches || partialMatches.length === 0) {
    return null;
  }
  
  // Return the best match (first result or closest match by length)
  const sortedByRelevance = partialMatches.sort((a, b) => {
    const aDistance = Math.abs(a.name.length - searchTerm.length);
    const bDistance = Math.abs(b.name.length - searchTerm.length);
    return aDistance - bDistance;
  });
  
  return sortedByRelevance[0];
}

/**
 * Find multiple leads matching a name pattern
 * 
 * @param {string} tenantId - Tenant UUID
 * @param {string} name - Name pattern to search
 * @param {number} [limit=10] - Maximum results
 * @returns {Promise<Lead[]>}
 */
export async function searchLeadsByName(tenantId, name, limit = 10) {
  const supa = getSupabaseClient();
  const searchTerm = name.trim();
  
  const { data, error } = await supa
    .from('leads')
    .select('id, name, email, phone, tenant_id')
    .eq('tenant_id', tenantId)
    .ilike('name', `%${searchTerm}%`)
    .limit(limit);
  
  if (error) {
    logger.error('[LeadLookup] Error searching leads:', error.message);
    return [];
  }
  
  return data || [];
}
