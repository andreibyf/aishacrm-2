/**
 * C.A.R.E. State Write Gate
 * 
 * Controls whether C.A.R.E. is allowed to persist state changes to the database.
 * 
 * This is SEPARATE from CARE_AUTONOMY_ENABLED (which controls action execution).
 * 
 * Behavior:
 * - CARE_STATE_WRITE_ENABLED=false (default): Read-only shadow mode
 *   - State proposals generated but not persisted
 *   - Audit events emitted (logs only)
 *   - No database writes to customer_care_state tables
 * 
 * - CARE_STATE_WRITE_ENABLED=true: State persistence enabled
 *   - State transitions written to customer_care_state
 *   - History appended to customer_care_state_history
 *   - Still no autonomous actions (requires CARE_AUTONOMY_ENABLED)
 * 
 * @module isCareStateWriteEnabled
 */

/**
 * Check if C.A.R.E. state writes are enabled
 * 
 * @returns {boolean} True if state writes are allowed
 */
export function isCareStateWriteEnabled() {
  // Default to false for safety
  const enabled = process.env.CARE_STATE_WRITE_ENABLED === 'true';
  return enabled;
}

export default isCareStateWriteEnabled;
