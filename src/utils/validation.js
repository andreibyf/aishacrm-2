/**
 * Input Validation Utilities
 * 
 * Centralized validation functions for common input patterns.
 * Helps maintain consistent validation logic across the application.
 * 
 * @module utils/validation
 */

/**
 * Validate email address format
 * 
 * @param {string} email - Email address to validate
 * @returns {boolean} True if email format is valid
 */
export function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  
  // RFC 5322 compliant email regex (simplified)
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Validate phone number format
 * Accepts various formats: (123) 456-7890, 123-456-7890, 1234567890, +1 123 456 7890
 * 
 * @param {string} phone - Phone number to validate
 * @returns {boolean} True if phone format is valid
 */
export function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  
  // Remove all non-digit characters for validation
  const digitsOnly = phone.replace(/\D/g, '');
  
  // Accept phone numbers with 10-15 digits (covers international formats)
  return digitsOnly.length >= 10 && digitsOnly.length <= 15;
}

/**
 * Validate URL format
 * 
 * @param {string} url - URL to validate
 * @returns {boolean} True if URL format is valid
 */
export function isValidUrl(url) {
  if (!url || typeof url !== 'string') return false;
  
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * Validate UUID format
 * 
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if UUID format is valid
 */
export function isValidUuid(uuid) {
  if (!uuid || typeof uuid !== 'string') return false;
  
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

/**
 * Validate that a string is not empty or whitespace-only
 * 
 * @param {string} value - String to validate
 * @returns {boolean} True if string has non-whitespace content
 */
export function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Validate that a value is a positive number
 * 
 * @param {any} value - Value to validate
 * @returns {boolean} True if value is a positive number
 */
export function isPositiveNumber(value) {
  return typeof value === 'number' && !isNaN(value) && value > 0;
}

/**
 * Validate that a value is a non-negative number (including zero)
 * 
 * @param {any} value - Value to validate
 * @returns {boolean} True if value is a non-negative number
 */
export function isNonNegativeNumber(value) {
  return typeof value === 'number' && !isNaN(value) && value >= 0;
}

/**
 * Sanitize string to prevent XSS attacks
 * Removes potentially dangerous HTML tags and attributes
 * 
 * @param {string} input - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeString(input) {
  if (!input || typeof input !== 'string') return '';
  
  // Remove HTML tags and trim
  return input.replace(/<[^>]*>/g, '').trim();
}

/**
 * Validate date string or Date object
 * 
 * @param {string|Date} date - Date to validate
 * @returns {boolean} True if date is valid
 */
export function isValidDate(date) {
  if (date instanceof Date) {
    return !isNaN(date.getTime());
  }
  
  if (typeof date === 'string') {
    const parsed = new Date(date);
    return !isNaN(parsed.getTime());
  }
  
  return false;
}

/**
 * Validate password strength
 * Password must be at least 8 characters with mixed case, numbers, and special chars
 * 
 * @param {string} password - Password to validate
 * @returns {Object} Validation result with isValid flag and error messages
 */
export function validatePassword(password) {
  const result = {
    isValid: true,
    errors: [],
  };
  
  if (!password || typeof password !== 'string') {
    result.isValid = false;
    result.errors.push('Password is required');
    return result;
  }
  
  if (password.length < 8) {
    result.isValid = false;
    result.errors.push('Password must be at least 8 characters long');
  }
  
  if (!/[a-z]/.test(password)) {
    result.isValid = false;
    result.errors.push('Password must contain at least one lowercase letter');
  }
  
  if (!/[A-Z]/.test(password)) {
    result.isValid = false;
    result.errors.push('Password must contain at least one uppercase letter');
  }
  
  if (!/[0-9]/.test(password)) {
    result.isValid = false;
    result.errors.push('Password must contain at least one number');
  }
  
  if (!/[^a-zA-Z0-9]/.test(password)) {
    result.isValid = false;
    result.errors.push('Password must contain at least one special character');
  }
  
  return result;
}

/**
 * Validate an array of values using a validator function
 * 
 * @param {Array} array - Array to validate
 * @param {Function} validator - Validator function to apply to each element
 * @returns {boolean} True if all elements pass validation
 */
export function validateArray(array, validator) {
  if (!Array.isArray(array)) return false;
  return array.every(validator);
}
