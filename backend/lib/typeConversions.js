/**
 * Type Conversion Utilities
 *
 * Centralized utilities for safe type conversions used across route handlers.
 * These functions handle null/undefined values gracefully and ensure consistent
 * data formatting for database operations.
 */

/**
 * Converts a value to a nullable string.
 * - Returns undefined if value is undefined (for partial updates)
 * - Returns null if value is null or empty string
 * - Trims strings and returns null if empty after trimming
 * - Converts other types to string
 *
 * @param {*} value - The value to convert
 * @returns {string|null|undefined}
 */
export const toNullableString = (value) => {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }
  return String(value);
};

/**
 * Converts a value to a numeric (float) value.
 * - Returns null for undefined, null, or empty string
 * - Returns null if parsing fails (NaN)
 * - Returns the parsed float otherwise
 *
 * @param {*} value - The value to convert
 * @returns {number|null}
 */
export const toNumeric = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseFloat(value);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Converts a value to an integer value.
 * - Returns null for undefined, null, or empty string
 * - Returns null if parsing fails (NaN)
 * - Returns the parsed integer otherwise
 *
 * @param {*} value - The value to convert
 * @returns {number|null}
 */
export const toInteger = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? null : parsed;
};

/**
 * Converts a value to a boolean.
 * - Returns null for undefined or null
 * - Returns the boolean value for booleans
 * - Returns true for truthy string values ('true', '1', 'yes')
 * - Returns false for falsy string values ('false', '0', 'no', '')
 *
 * @param {*} value - The value to convert
 * @returns {boolean|null}
 */
export const toBoolean = (value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === '1' || lower === 'yes') return true;
    if (lower === 'false' || lower === '0' || lower === 'no' || lower === '') return false;
  }
  return Boolean(value);
};

/**
 * Helper to assign a string field to a target object.
 * Only assigns if value is not undefined (allows null to clear values).
 *
 * @param {Object} target - The target object to modify
 * @param {string} key - The key to assign
 * @param {*} value - The value to convert and assign
 */
export const assignStringField = (target, key, value) => {
  if (value === undefined) return;
  target[key] = toNullableString(value);
};

/**
 * Helper to assign a numeric field to a target object.
 * Only assigns if value is not undefined.
 *
 * @param {Object} target - The target object to modify
 * @param {string} key - The key to assign
 * @param {*} value - The value to convert and assign
 */
export const assignNumericField = (target, key, value) => {
  if (value === undefined) return;
  target[key] = value === null ? null : toNumeric(value);
};

/**
 * Helper to assign an integer field to a target object.
 * Only assigns if value is not undefined.
 *
 * @param {Object} target - The target object to modify
 * @param {string} key - The key to assign
 * @param {*} value - The value to convert and assign
 */
export const assignIntegerField = (target, key, value) => {
  if (value === undefined) return;
  target[key] = value === null ? null : toInteger(value);
};

/**
 * Helper to assign a boolean field to a target object.
 * Only assigns if value is not undefined.
 *
 * @param {Object} target - The target object to modify
 * @param {string} key - The key to assign
 * @param {*} value - The value to convert and assign
 */
export const assignBooleanField = (target, key, value) => {
  if (value === undefined) return;
  target[key] = value === null ? null : toBoolean(value);
};
