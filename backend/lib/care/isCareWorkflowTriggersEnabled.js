/**
 * Gate helper for C.A.R.E. Workflow Triggers
 * 
 * PR8: Workflow Webhook Trigger Integration
 * 
 * Returns true if workflow triggers are enabled via env flag.
 * Default: false (safe)
 */

/**
 * Check if C.A.R.E. workflow triggers are enabled
 * @returns {boolean} true if enabled, false otherwise
 */
export function isCareWorkflowTriggersEnabled() {
  const envValue = process.env.CARE_WORKFLOW_TRIGGERS_ENABLED;
  
  if (!envValue) {
    return false;
  }
  
  const normalized = envValue.toLowerCase().trim();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

export default isCareWorkflowTriggersEnabled;
