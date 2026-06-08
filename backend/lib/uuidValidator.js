/**
 * UUID Validation Utilities
 *
 * Prevents "invalid input syntax for type uuid" errors by validating
 * UUID inputs at the application boundary before passing to database queries.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Check if a string is a valid UUID v4
 * @param {string} value - Value to check
 * @returns {boolean} True if valid UUID
 */
export function isValidUUID(value) {
  if (typeof value !== 'string') return false;
  return UUID_REGEX.test(value);
}

/**
 * Sanitize UUID input for database queries
 * Converts invalid UUIDs to NULL to prevent SQL errors
 *
 * @param {string|null|undefined} value - Input value
 * @param {object} options - Sanitization options
 * @param {boolean} options.allowNull - Allow NULL values (default: true)
 * @param {string[]} options.systemAliases - Non-UUID values to map to NULL (default: ['system', 'unknown'])
 * @returns {string|null} Valid UUID or NULL
 */
export function sanitizeUuidInput(value, options = {}) {
  const { allowNull = true, systemAliases = ['system', 'unknown', 'anonymous'] } = options;

  // Handle null/undefined
  if (value === null || value === undefined || value === '') {
    return allowNull ? null : undefined;
  }

  // Handle system aliases
  if (typeof value === 'string' && systemAliases.includes(value.toLowerCase())) {
    return null;
  }

  // Validate UUID
  if (!isValidUUID(value)) {
    // Log only that rejection occurred — no value or length to avoid leaking env data
    console.warn('[UUID Validator] Invalid UUID rejected');
    return null;
  }

  return value;
}

/**
 * Resolve the tenant_id to use for system-originated rows (system_logs, audit_log, etc.).
 * Prevents `invalid input syntax for type uuid: "system"` insert failures by coercing
 * system aliases and invalid UUIDs:
 *   1. If the supplied value is a valid UUID, use it.
 *   2. Else, if SYSTEM_TENANT_ID env is a valid UUID, use that.
 *   3. Else, return null (the column is nullable).
 *
 * @param {string|null|undefined} rawTenantId - Caller-supplied tenant id (defaults to 'system')
 * @returns {string|null} A valid UUID or null
 */
export function resolveSystemTenantId(rawTenantId) {
  const sanitized = sanitizeUuidInput(rawTenantId ?? 'system');
  if (sanitized) return sanitized;
  if (process.env.SYSTEM_TENANT_ID) {
    return sanitizeUuidInput(process.env.SYSTEM_TENANT_ID);
  }
  return null;
}

/**
 * Sanitize filter object to ensure UUID columns only receive valid UUIDs
 *
 * @param {object} filter - Filter object (e.g., { tenant_id: 'abc', user_id: 'system' })
 * @param {string[]} uuidColumns - Column names that should contain UUIDs
 * @returns {object} Sanitized filter
 */
export function sanitizeUuidFilter(filter, uuidColumns = []) {
  if (!filter || typeof filter !== 'object') return filter;

  const sanitized = { ...filter };

  // Handle $or/$and at top level - always process recursively
  if ('$or' in sanitized && Array.isArray(sanitized.$or)) {
    sanitized.$or = sanitized.$or.map((cond) => sanitizeUuidFilter(cond, uuidColumns));
  }
  if ('$and' in sanitized && Array.isArray(sanitized.$and)) {
    sanitized.$and = sanitized.$and.map((cond) => sanitizeUuidFilter(cond, uuidColumns));
  }

  uuidColumns.forEach((column) => {
    if (column in sanitized) {
      const value = sanitized[column];

      // Skip if value is an operator object (e.g., { $regex: '...' })
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        return;
      }

      // Sanitize the value
      sanitized[column] = sanitizeUuidInput(value);
    }
  });

  return sanitized;
}

/**
 * Express middleware to validate UUID parameters
 *
 * @param {string[]} paramNames - Parameter names to validate
 * @returns {Function} Express middleware
 */
export function validateUuidParams(...paramNames) {
  return (req, res, next) => {
    const invalid = [];

    paramNames.forEach((param) => {
      const value = req.params[param];
      if (value && !isValidUUID(value)) {
        invalid.push({ param, value });
      }
    });

    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'Invalid UUID parameter',
        details: invalid.map(
          ({ param, value }) => `Parameter '${param}' has invalid UUID: "${value}"`,
        ),
      });
    }

    next();
  };
}

/**
 * Express middleware to validate UUID query parameters
 *
 * @param {string[]} queryNames - Query parameter names to validate
 * @returns {Function} Express middleware
 */
export function validateUuidQuery(...queryNames) {
  return (req, res, next) => {
    const invalid = [];

    queryNames.forEach((param) => {
      const value = req.query[param];
      if (value && value !== 'null' && !isValidUUID(value)) {
        invalid.push({ param, value });
      }
    });

    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'Invalid UUID query parameter',
        details: invalid.map(
          ({ param, value }) => `Query parameter '${param}' has invalid UUID: "${value}"`,
        ),
      });
    }

    next();
  };
}

// ─── Route helpers (response-based validation for API routes) ─────────────────

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
