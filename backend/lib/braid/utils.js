/**
 * Braid Utilities Module
 * Helper functions for backend dependencies, field filtering, and schema loading
 */

import { loadToolSchema as braidLoadToolSchema } from '../../../braid-llm-kit/sdk/index.js';
import { getSupabaseClient } from '../supabase-db.js';

const supabaseAdmin = getSupabaseClient();

/**
 * Create backend dependencies for Braid tool execution
 * @param {string} backendUrl - Backend base URL
 * @param {string} tenantUuid - Tenant UUID
 * @param {string} userId - User ID
 * @param {string} internalToken - JWT token for service calls
 * @param {string} createdBy - User name/email for audit trails
 * @returns {Object} Dependencies object for Braid
 */
export function createBackendDeps(backendUrl, tenantUuid, userId, internalToken, createdBy) {
  return {
    supabase: supabaseAdmin,
    backendUrl,
    tenantUuid,
    userId,
    internalToken,
    createdBy,
    // Additional context
    requestId: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    timestamp: new Date().toISOString()
  };
}

/**
 * Filter sensitive fields based on user role
 * @param {any} data - Data to filter
 * @param {string} entityType - Type of entity (lead, account, etc.)
 * @param {string} userRole - User role (user, manager, admin, superadmin)
 * @returns {any} Filtered data
 */
export function filterSensitiveFields(data, entityType, userRole = 'user') {
  // Define sensitive fields per entity type and minimum role required
  const sensitiveFields = {
    account: {
      annual_revenue: 'manager',
      internal_notes: 'admin',
      created_by: 'manager'
    },
    lead: {
      internal_notes: 'admin',
      source_details: 'manager'
    },
    contact: {
      personal_email: 'manager',
      personal_phone: 'manager',
      internal_notes: 'admin'
    },
    opportunity: {
      internal_notes: 'admin',
      commission_details: 'admin'
    }
  };

  const roleHierarchy = {
    user: 1,
    manager: 2,
    admin: 3,
    superadmin: 4
  };

  const userLevel = roleHierarchy[userRole] || 1;
  const entityFields = sensitiveFields[entityType] || {};

  // If data is an array, filter each item
  if (Array.isArray(data)) {
    return data.map(item => filterSensitiveFields(item, entityType, userRole));
  }

  // If not an object, return as-is
  if (!data || typeof data !== 'object') {
    return data;
  }

  // Filter the object
  const filtered = { ...data };
  
  for (const [field, requiredRole] of Object.entries(entityFields)) {
    const requiredLevel = roleHierarchy[requiredRole] || 1;
    
    if (userLevel < requiredLevel && field in filtered) {
      delete filtered[field];
    }
  }

  return filtered;
}

/**
 * Load tool schema from Braid file
 * @param {string} braidPath - Path to .braid file
 * @param {string} functionName - Function name to load schema for
 * @returns {Promise<Object>} Tool schema
 */
export async function loadToolSchema(braidPath, functionName) {
  try {
    return await braidLoadToolSchema(braidPath, functionName);
  } catch (error) {
    console.error(`[Braid] Failed to load schema from ${braidPath}#${functionName}:`, error);
    throw error;
  }
}

/**
 * Normalize tool arguments for consistent processing
 * @param {Object} args - Raw tool arguments
 * @returns {Object} Normalized arguments
 */
export function normalizeToolArgs(args = {}) {
  const normalized = { ...args };
  
  // Ensure tenant_id is a UUID string
  if (normalized.tenant_id && typeof normalized.tenant_id === 'object') {
    normalized.tenant_id = normalized.tenant_id.toString();
  }
  
  // Convert dates to ISO strings
  for (const [key, value] of Object.entries(normalized)) {
    if (value instanceof Date) {
      normalized[key] = value.toISOString();
    }
  }
  
  return normalized;
}

/**
 * Validate tool arguments for security and completeness
 * @param {string} toolName - Tool name
 * @param {Object} args - Tool arguments
 * @param {Object} context - Execution context
 * @returns {Object} Validation result
 */
export function validateToolArgs(toolName, args, context) {
  const errors = [];
  const warnings = [];
  
  // Check for required tenant context
  if (!context.tenantUuid || !isValidUuid(context.tenantUuid)) {
    errors.push('Valid tenant UUID is required');
  }
  
  // Check for user context
  if (!context.userId) {
    warnings.push('User ID not provided in context');
  }
  
  // Validate tool-specific requirements
  if (toolName.includes('delete') && !context.confirmDelete) {
    errors.push('Delete operations require explicit confirmation');
  }
  
  return {
    valid: errors.length === 0,
    errors,
    warnings
  };
}

/**
 * Normalize tool filter for consistent handling
 * @param {any} allowedTools - Tools filter (Set, Array, or null)
 * @returns {Set|null} Normalized Set or null
 */
export function normalizeToolFilter(allowedTools) {
  if (!allowedTools) return null;
  if (allowedTools instanceof Set) return allowedTools;
  if (Array.isArray(allowedTools)) return new Set(allowedTools);
  return null;
}

/**
 * Generate request ID for tracking
 * @returns {string} Unique request ID
 */
export function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Load schema for entity type
 * @param {string} entityType - Entity type (lead, account, etc.)
 * @returns {Object} Entity schema definition
 */
export function loadSchemaForEntity(entityType) {
  const schemas = {
    lead: {
      required: ['name', 'tenant_id'],
      optional: ['email', 'phone', 'company', 'source', 'status'],
      sensitive: ['internal_notes']
    },
    account: {
      required: ['name', 'tenant_id'],
      optional: ['phone', 'email', 'website', 'industry', 'annual_revenue'],
      sensitive: ['internal_notes', 'annual_revenue']
    },
    contact: {
      required: ['name', 'tenant_id'],
      optional: ['email', 'phone', 'job_title', 'account_id'],
      sensitive: ['personal_email', 'personal_phone', 'internal_notes']
    },
    opportunity: {
      required: ['name', 'tenant_id', 'stage'],
      optional: ['amount', 'close_date', 'probability', 'account_id'],
      sensitive: ['internal_notes', 'commission_details']
    },
    activity: {
      required: ['title', 'tenant_id', 'activity_type'],
      optional: ['description', 'due_date', 'completed', 'related_to_id'],
      sensitive: []
    }
  };
  
  return schemas[entityType] || { required: [], optional: [], sensitive: [] };
}

/**
 * Get fields for entity type
 * @param {string} entityType - Entity type
 * @returns {Array} Array of field names
 */
export function getFieldsForEntity(entityType) {
  const schema = loadSchemaForEntity(entityType);
  return [...schema.required, ...schema.optional];
}

/**
 * Map V1 API fields to V2 format
 * @param {Object} v1Data - V1 format data
 * @param {string} entityType - Entity type
 * @returns {Object} V2 format data
 */
export function mapV1ToV2Fields(v1Data, entityType) {
  if (!v1Data || typeof v1Data !== 'object') return v1Data;
  
  const mapped = { ...v1Data };
  
  // Common V1 -> V2 mappings
  const mappings = {
    lead: {
      'metadata.source': 'source',
      'metadata.notes': 'notes'
    },
    account: {
      'metadata.industry': 'industry',
      'metadata.website': 'website'
    },
    contact: {
      'metadata.job_title': 'job_title'
    }
  };
  
  const entityMappings = mappings[entityType] || {};
  
  for (const [v1Path, v2Field] of Object.entries(entityMappings)) {
    const keys = v1Path.split('.');
    let value = mapped;
    
    // Navigate to nested value
    for (const key of keys) {
      if (value && typeof value === 'object') {
        value = value[key];
      } else {
        value = undefined;
        break;
      }
    }
    
    // Set V2 field if V1 value exists
    if (value !== undefined) {
      mapped[v2Field] = value;
    }
  }
  
  return mapped;
}

/**
 * Validate UUID format
 * @param {string} uuid - UUID to validate
 * @returns {boolean} True if valid UUID
 */
export function isValidUUID(uuid) {
  if (typeof uuid !== 'string') return false;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(uuid);
}

// Alias for backward compatibility
export const isValidUuid = isValidUUID;

/**
 * Sanitize string for logging (remove sensitive data)
 * @param {string} str - String to sanitize
 * @returns {string} Sanitized string
 */
export function sanitizeForLog(str) {
  if (typeof str !== 'string') return str;
  
  // Remove email addresses
  str = str.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
  
  // Remove phone numbers
  str = str.replace(/(\+\d{1,3}[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g, '[PHONE]');
  
  // Remove UUIDs (might be sensitive IDs)
  str = str.replace(/[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/gi, '[UUID]');
  
  return str;
}

/**
 * Deep clone object (simple implementation for tool args)
 * @param {any} obj - Object to clone
 * @returns {any} Cloned object
 */
export function deepClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  
  if (Array.isArray(obj)) {
    return obj.map(item => deepClone(item));
  }
  
  const cloned = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      cloned[key] = deepClone(obj[key]);
    }
  }
  
  return cloned;
}

/**
 * Merge objects with precedence (later objects override earlier ones)
 * @param {...Object} objects - Objects to merge
 * @returns {Object} Merged object
 */
export function mergeObjects(...objects) {
  const result = {};
  
  for (const obj of objects) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      Object.assign(result, obj);
    }
  }
  
  return result;
}

/**
 * Parse ISO date string safely
 * @param {string} dateStr - ISO date string
 * @returns {Date|null} Parsed date or null if invalid
 */
export function parseISODate(dateStr) {
  if (!dateStr || typeof dateStr !== 'string') return null;
  
  try {
    const date = new Date(dateStr);
    return isNaN(date.getTime()) ? null : date;
  } catch {
    return null;
  }
}

/**
 * Format date for API calls (YYYY-MM-DD)
 * @param {Date|string} date - Date to format
 * @returns {string|null} Formatted date string
 */
export function formatDateForAPI(date) {
  let d = date;
  
  if (typeof date === 'string') {
    d = parseISODate(date);
  }
  
  if (!d || !(d instanceof Date) || isNaN(d.getTime())) {
    return null;
  }
  
  return d.toISOString().split('T')[0];
}

/**
 * Retry function with exponential backoff
 * @param {Function} fn - Function to retry
 * @param {number} maxRetries - Maximum retry attempts
 * @param {number} baseDelay - Base delay in ms
 * @returns {Promise<any>} Result of function
 */
export async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
  let lastError;
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries) {
        break;
      }
      
      const delay = baseDelay * Math.pow(2, attempt);
      console.warn(`[Retry] Attempt ${attempt + 1} failed, retrying in ${delay}ms:`, error.message);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError;
}

// Alias for backward compatibility
export const retry = retryWithBackoff;

/**
 * Timeout wrapper for promises
 * @param {Promise} promise - Promise to wrap
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise} Promise that rejects on timeout
 */
export function withTimeout(promise, timeoutMs) {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  
  return Promise.race([promise, timeoutPromise]);
}