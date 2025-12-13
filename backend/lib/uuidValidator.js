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
    console.warn(`[UUID Validator] Invalid UUID rejected: "${value}"`);
    return null;
  }

  return value;
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

  uuidColumns.forEach(column => {
    if (column in sanitized) {
      const value = sanitized[column];
      
      // Handle $or/$and nested conditions
      if (column === '$or' || column === '$and') {
        if (Array.isArray(value)) {
          sanitized[column] = value.map(cond => sanitizeUuidFilter(cond, uuidColumns));
        }
        return;
      }

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

    paramNames.forEach(param => {
      const value = req.params[param];
      if (value && !isValidUUID(value)) {
        invalid.push({ param, value });
      }
    });

    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'Invalid UUID parameter',
        details: invalid.map(({ param, value }) => 
          `Parameter '${param}' has invalid UUID: "${value}"`
        )
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

    queryNames.forEach(param => {
      const value = req.query[param];
      if (value && value !== 'null' && !isValidUUID(value)) {
        invalid.push({ param, value });
      }
    });

    if (invalid.length > 0) {
      return res.status(400).json({
        error: 'Invalid UUID query parameter',
        details: invalid.map(({ param, value }) => 
          `Query parameter '${param}' has invalid UUID: "${value}"`
        )
      });
    }

    next();
  };
}
