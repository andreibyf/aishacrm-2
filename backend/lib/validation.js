/**
 * Validation utilities for API routes
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validate if a string is a valid UUID v4
 * @param {string} value - The value to validate
 * @returns {boolean} True if valid UUID
 */
export function isValidUUID(value) {
  if (!value || typeof value !== 'string') return false;
  return UUID_REGEX.test(value);
}

/**
 * Validate UUID parameter and send 400 if invalid
 * @param {string} id - The ID to validate
 * @param {object} res - Express response object
 * @returns {boolean} False if invalid (response sent), true if valid
 */
export function validateUUIDParam(id, res) {
  if (!isValidUUID(id)) {
    res.status(400).json({
      status: 'error',
      message: 'Invalid UUID format',
    });
    return false;
  }
  return true;
}

/**
 * Validate tenant_id requirement and send 400 if missing
 * @param {string} tenant_id - The tenant_id to validate
 * @param {object} res - Express response object
 * @returns {boolean} False if missing (response sent), true if present
 */
export function validateTenantId(tenant_id, res) {
  if (!tenant_id) {
    res.status(400).json({
      status: 'error',
      message: 'tenant_id is required',
    });
    return false;
  }
  return true;
}

/**
 * Combined validation for UUID ID and tenant_id
 * @param {string} id - The ID to validate
 * @param {string} tenant_id - The tenant_id to validate
 * @param {object} res - Express response object
 * @returns {boolean} False if any validation failed (response sent), true if all valid
 */
export function validateTenantScopedId(id, tenant_id, res) {
  if (!validateUUIDParam(id, res)) return false;
  if (!validateTenantId(tenant_id, res)) return false;
  return true;
}
