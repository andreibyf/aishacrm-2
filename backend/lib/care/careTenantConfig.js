/**
 * CARE Tenant Config Helper
 * 
 * Provides per-tenant CARE workflow configuration lookup.
 * Falls back to environment variables if no tenant-specific config exists.
 * 
 * This replaces the hardcoded process.env.CARE_WORKFLOW_ESCALATION_WEBHOOK_URL
 * usage throughout the codebase.
 */

import { getSupabaseClient } from '../supabase-db.js';
import logger from '../logger.js';

// Cache for tenant configs (TTL: 60 seconds)
const configCache = new Map();
const CACHE_TTL_MS = 60000;

/**
 * Get CARE workflow configuration for a specific tenant
 * 
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<Object|null>} CARE config or null if not configured
 */
export async function getCareConfigForTenant(tenantId) {
  if (!tenantId) {
    logger.debug('[CareConfig] No tenant_id provided, using env fallback');
    return getEnvFallbackConfig();
  }

  // Check cache first
  const cached = configCache.get(tenantId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.config;
  }

  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('care_workflow_config')
      .select('*')
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (error) {
      logger.warn(`[CareConfig] Error fetching config for tenant ${tenantId}:`, error.message);
      return getEnvFallbackConfig();
    }

    if (!data) {
      // No tenant-specific config, use env fallback
      logger.debug(`[CareConfig] No config for tenant ${tenantId}, using env fallback`);
      const fallback = getEnvFallbackConfig();
      
      // Cache the fallback
      configCache.set(tenantId, {
        config: fallback,
        timestamp: Date.now()
      });
      
      return fallback;
    }

    // Build effective webhook URL
    let webhookUrl = data.webhook_url;
    if (!webhookUrl && data.workflow_id) {
      // CARE_WEBHOOK_BASE_URL is for internal container access (backend calling itself)
      // Default to localhost:3001 (internal port) for Docker environments
      const baseUrl = process.env.CARE_WEBHOOK_BASE_URL || 'http://localhost:3001';
      webhookUrl = `${baseUrl}/api/workflows/${data.workflow_id}/webhook`;
    }

    const config = {
      tenant_id: tenantId,
      workflow_id: data.workflow_id,
      webhook_url: webhookUrl,
      webhook_secret: data.webhook_secret || process.env.CARE_WORKFLOW_WEBHOOK_SECRET,
      is_enabled: data.is_enabled,
      state_write_enabled: data.state_write_enabled,
      shadow_mode: data.shadow_mode,
      webhook_timeout_ms: data.webhook_timeout_ms || 3000,
      webhook_max_retries: data.webhook_max_retries || 2,
      _source: 'database'
    };

    // Cache the config
    configCache.set(tenantId, {
      config,
      timestamp: Date.now()
    });

    return config;
  } catch (err) {
    logger.error(`[CareConfig] Unexpected error for tenant ${tenantId}:`, err);
    return getEnvFallbackConfig();
  }
}

/**
 * Get fallback config from environment variables
 * Used when no tenant-specific config exists
 */
function getEnvFallbackConfig() {
  return {
    tenant_id: null,
    workflow_id: null,
    webhook_url: process.env.CARE_WORKFLOW_ESCALATION_WEBHOOK_URL || null,
    webhook_secret: process.env.CARE_WORKFLOW_WEBHOOK_SECRET || null,
    is_enabled: process.env.CARE_WORKFLOW_TRIGGERS_ENABLED === 'true',
    state_write_enabled: process.env.CARE_STATE_WRITE_ENABLED === 'true',
    shadow_mode: process.env.CARE_SHADOW_MODE !== 'false', // Default to true
    webhook_timeout_ms: parseInt(process.env.CARE_WORKFLOW_WEBHOOK_TIMEOUT_MS || '3000', 10),
    webhook_max_retries: parseInt(process.env.CARE_WORKFLOW_WEBHOOK_MAX_RETRIES || '2', 10),
    _source: 'environment'
  };
}

/**
 * Check if CARE is enabled for a specific tenant
 * 
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<boolean>}
 */
export async function isCareEnabledForTenant(tenantId) {
  const config = await getCareConfigForTenant(tenantId);
  return config?.is_enabled === true && !!config?.webhook_url;
}

/**
 * Check if state writes are enabled for a specific tenant
 * 
 * @param {string} tenantId - Tenant UUID
 * @returns {Promise<boolean>}
 */
export async function isCareStateWriteEnabledForTenant(tenantId) {
  const config = await getCareConfigForTenant(tenantId);
  return config?.state_write_enabled === true;
}

/**
 * Invalidate cached config for a tenant
 * Call this when config is updated via API
 * 
 * @param {string} tenantId - Tenant UUID
 */
export function invalidateCareConfigCache(tenantId) {
  if (tenantId) {
    configCache.delete(tenantId);
  }
}

/**
 * Clear entire config cache
 */
export function clearCareConfigCache() {
  configCache.clear();
}

export default {
  getCareConfigForTenant,
  isCareEnabledForTenant,
  isCareStateWriteEnabledForTenant,
  invalidateCareConfigCache,
  clearCareConfigCache
};
