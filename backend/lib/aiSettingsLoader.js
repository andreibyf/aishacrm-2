/**
 * AI Settings Loader
 * 
 * Provides functions to load AI configuration settings from the database
 * with fallback to hardcoded defaults. Supports per-tenant and per-agent overrides.
 * 
 * Resolution order:
 * 1. Tenant + Agent specific (tenant_id = X, agent_role = 'aisha')
 * 2. Tenant global (tenant_id = X, agent_role = NULL) -- future
 * 3. System + Agent default (tenant_id = NULL, agent_role = 'aisha')
 * 4. Code fallback (hardcoded default)
 */

import { getSupabaseClient } from './supabase-db.js';

// Hardcoded defaults as ultimate fallback
const DEFAULTS = {
  // Context Management
  max_messages: 8,
  max_chars_per_message: 1500,
  
  // Tool Execution
  max_iterations: 3,
  max_tools: 12,
  
  // Memory/RAG
  top_k: 3,
  max_chunk_chars: 300,
  
  // Model Behavior
  temperature: 0.4,
  top_p: 1.0,
  
  // Behavior
  intent_confidence_threshold: 0.7,
  enable_memory: true,
  enable_follow_up_suggestions: true,
  
  // Developer AI specific
  require_approval_for_destructive: true,
};

// In-memory cache to avoid repeated DB calls
let settingsCache = null;
let cacheTimestamp = 0;
const CACHE_TTL_MS = 60000; // 1 minute cache

/**
 * Load all AI settings from database
 * @param {string} agentRole - 'aisha', 'developer', etc.
 * @param {string|null} tenantId - Optional tenant ID for tenant-specific settings
 * @returns {Promise<Object>} Settings object with resolved values
 */
export async function loadAiSettings(agentRole = 'aisha', tenantId = null) {
  const now = Date.now();
  const cacheKey = `${agentRole}:${tenantId || 'global'}`;
  
  // Check cache
  if (settingsCache?.[cacheKey] && (now - cacheTimestamp) < CACHE_TTL_MS) {
    return settingsCache[cacheKey];
  }
  
  try {
    const supa = getSupabaseClient();
    
    // Fetch settings - global defaults first, then tenant overrides
    let query = supa
      .from('ai_settings')
      .select('setting_key, setting_value, category')
      .eq('agent_role', agentRole);
    
    if (tenantId) {
      // Get both global (tenant_id IS NULL) and tenant-specific
      query = query.or(`tenant_id.is.null,tenant_id.eq.${tenantId}`);
    } else {
      query = query.is('tenant_id', null);
    }
    
    const { data, error } = await query;
    
    if (error) {
      console.warn('[aiSettingsLoader] Failed to load settings:', error.message);
      return { ...DEFAULTS };
    }
    
    // Build settings object, with tenant-specific overriding global
    const settings = { ...DEFAULTS };
    
    // Sort so global (null tenant_id) comes first, then tenant-specific overrides
    const sorted = (data || []).sort((a, b) => {
      if (a.tenant_id === null && b.tenant_id !== null) return -1;
      if (a.tenant_id !== null && b.tenant_id === null) return 1;
      return 0;
    });
    
    for (const row of sorted) {
      const val = row.setting_value?.value;
      if (val !== undefined) {
        settings[row.setting_key] = val;
      }
    }
    
    // Update cache
    if (!settingsCache) settingsCache = {};
    settingsCache[cacheKey] = settings;
    cacheTimestamp = now;
    
    return settings;
  } catch (err) {
    console.error('[aiSettingsLoader] Error:', err.message);
    return { ...DEFAULTS };
  }
}

/**
 * Get a single AI setting value
 * @param {string} key - Setting key (e.g., 'temperature', 'max_messages')
 * @param {string} agentRole - Agent role
 * @param {string|null} tenantId - Optional tenant ID
 * @returns {Promise<any>} Setting value
 */
export async function getAiSetting(key, agentRole = 'aisha', tenantId = null) {
  const settings = await loadAiSettings(agentRole, tenantId);
  return settings[key] ?? DEFAULTS[key];
}

/**
 * Clear the settings cache (call after updates)
 */
export function clearAiSettingsCache() {
  settingsCache = null;
  cacheTimestamp = 0;
}

/**
 * Get default values (for reference/documentation)
 */
export function getAiSettingsDefaults() {
  return { ...DEFAULTS };
}

export default {
  loadAiSettings,
  getAiSetting,
  clearAiSettingsCache,
  getAiSettingsDefaults,
};
