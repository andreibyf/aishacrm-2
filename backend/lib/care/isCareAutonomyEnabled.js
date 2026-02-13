/**
 * C.A.R.E. Autonomy Gate
 * 
 * Canonical helper to determine if C.A.R.E. autonomous actions are permitted.
 * 
 * STRICT SAFETY RULE:
 * Autonomy is enabled ONLY when ALL of the following are true:
 * 1. CARE_AUTONOMY_ENABLED=true (explicit opt-in)
 * 2. CARE_SHADOW_MODE=false (not in observe-only mode)
 * 
 * Any other state returns FALSE.
 * 
 * This is the ONLY function that should be used to check if autonomous
 * C.A.R.E. actions are allowed. Do NOT implement separate checks elsewhere.
 * 
 * @module isCareAutonomyEnabled
 */

import { getCareAutonomyEnabled, getCareShadowModeEnabled } from './careConfig.js';

/**
 * Check if C.A.R.E. autonomous actions are permitted
 * 
 * @returns {boolean} True ONLY if autonomy is enabled AND shadow mode is disabled
 * 
 * @example
 * // Safe default (unset env vars)
 * isCareAutonomyEnabled() // => false
 * 
 * @example
 * // Autonomy enabled but in shadow mode (observe-only)
 * // CARE_AUTONOMY_ENABLED=true, CARE_SHADOW_MODE=true
 * isCareAutonomyEnabled() // => false
 * 
 * @example
 * // Full autonomy (opt-in required)
 * // CARE_AUTONOMY_ENABLED=true, CARE_SHADOW_MODE=false
 * isCareAutonomyEnabled() // => true
 */
export function isCareAutonomyEnabled() {
  const autonomyEnabled = getCareAutonomyEnabled();
  const shadowMode = getCareShadowModeEnabled();
  
  // Autonomy requires explicit enable AND shadow mode must be off
  return autonomyEnabled === true && shadowMode === false;
}

/**
 * Get detailed autonomy status for debugging/logging
 * 
 * @returns {Object} Status object with flags and computed result
 */
export function getCareAutonomyStatus() {
  const autonomyEnabled = getCareAutonomyEnabled();
  const shadowMode = getCareShadowModeEnabled();
  const isEnabled = isCareAutonomyEnabled();
  
  return {
    autonomy_enabled: autonomyEnabled,
    shadow_mode: shadowMode,
    is_autonomous: isEnabled,
    mode: isEnabled ? 'autonomous' : (autonomyEnabled ? 'shadow' : 'disabled'),
  };
}

export default isCareAutonomyEnabled;
