/**
 * Customer C.A.R.E. Configuration
 * 
 * Central configuration for Customer Cognitive Autonomous Relationship Execution.
 * 
 * Safety-first design:
 * - Autonomy is OFF by default (CARE_AUTONOMY_ENABLED=false)
 * - Shadow mode is ON by default (CARE_SHADOW_MODE=true)
 * - All actions require explicit opt-in via environment configuration
 * 
 * This module MUST NOT:
 * - Send outbound messages
 * - Schedule meetings
 * - Execute workflows
 * - Modify user-facing data
 * 
 * @module careConfig
 */

/**
 * Parse boolean environment variable with safe defaults
 * @param {string} value - Raw env var value
 * @param {boolean} defaultValue - Default if unparseable
 * @returns {boolean}
 */
function parseBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') {
    return defaultValue;
  }
  
  const normalized = String(value).toLowerCase().trim();
  
  // Truthy values
  if (['true', '1', 'yes', 'on', 'enabled'].includes(normalized)) {
    return true;
  }
  
  // Falsy values
  if (['false', '0', 'no', 'off', 'disabled'].includes(normalized)) {
    return false;
  }
  
  // Unknown value - use default for safety
  return defaultValue;
}

/**
 * Get whether C.A.R.E. autonomy is enabled
 * 
 * @returns {boolean} True if autonomy is explicitly enabled
 */
export function getCareAutonomyEnabled() {
  return parseBoolean(process.env.CARE_AUTONOMY_ENABLED, false);
}

/**
 * Get whether C.A.R.E. shadow mode is enabled
 * 
 * Shadow mode = autonomy decisions are logged but NOT executed
 * 
 * @returns {boolean} True if shadow mode is enabled (default: true)
 */
export function getCareShadowModeEnabled() {
  return parseBoolean(process.env.CARE_SHADOW_MODE, true);
}

/**
 * Get all C.A.R.E. configuration as a snapshot
 * 
 * @returns {Object} Current configuration
 */
export function getCareConfig() {
  return {
    autonomy_enabled: getCareAutonomyEnabled(),
    shadow_mode: getCareShadowModeEnabled(),
    timestamp: new Date().toISOString(),
  };
}

export default {
  getCareAutonomyEnabled,
  getCareShadowModeEnabled,
  getCareConfig,
};
