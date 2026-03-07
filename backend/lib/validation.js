/**
 * Validation utilities for API routes
 *
 * Re-exports from uuidValidator.js to avoid duplicate utility modules.
 * Use this file for route-layer validation (validateTenantScopedId, etc.).
 * For sanitization and middleware, import from uuidValidator.js directly.
 */

export {
  isValidUUID,
  validateUUIDParam,
  validateTenantId,
  validateTenantScopedId,
} from './uuidValidator.js';
