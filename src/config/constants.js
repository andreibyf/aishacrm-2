/**
 * Centralized Frontend Constants
 *
 * All application constants should be defined here to ensure consistency
 * across the codebase and make configuration changes easier.
 */

// =============================================================================
// API & NETWORK TIMEOUTS
// =============================================================================

export const TIMEOUTS = {
  /** Default API request timeout in ms */
  API_REQUEST: 8000,

  /** Resilient fetch timeout for retryable requests */
  RESILIENT_FETCH: 6000,

  /** Component test timeout */
  COMPONENT_TEST: 10000,

  /** Rollback auto-trigger timeout */
  ROLLBACK: 1000,

  /** Circuit breaker reset timeout */
  CIRCUIT_BREAKER_RESET: 30000,

  /** Circuit breaker rolling count window */
  CIRCUIT_BREAKER_WINDOW: 10000,

  /** Default polling interval for real-time updates */
  POLLING_INTERVAL: 3000,

  /** User presence heartbeat interval */
  PRESENCE_HEARTBEAT: 60000,

  /** Minimum presence heartbeat interval */
  PRESENCE_HEARTBEAT_MIN: 15000,
};

// =============================================================================
// CACHE CONFIGURATION
// =============================================================================

export const CACHE = {
  /** Result cache TTL for preventing duplicate API calls (ms) */
  RESULT_TTL: 5000,

  /** Dashboard data cache TTL */
  DASHBOARD_TTL: 5000,

  /** Bundle data cache TTL */
  BUNDLE_TTL: 5000,

  /** Entity list cache TTL */
  ENTITY_LIST_TTL: 30000,

  /** User data cache TTL */
  USER_DATA_TTL: 60000,
};

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

export const PAGINATION = {
  /** Default items per page */
  DEFAULT_LIMIT: 50,

  /** Default limit for search results */
  SEARCH_LIMIT: 25,

  /** Maximum items per page */
  MAX_LIMIT: 200,

  /** Default offset */
  DEFAULT_OFFSET: 0,
};

// =============================================================================
// API CONFIGURATION
// =============================================================================

export const API = {
  /** Backend API base URL (from env or fallback) */
  BASE_URL: import.meta.env.VITE_BACKEND_URL || 'http://localhost:4001',

  /** Supabase URL */
  SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL || '',

  /** Braid MCP server URL */
  BRAID_MCP_URL: import.meta.env.VITE_BRAID_MCP_URL || 'http://localhost:8000',

  /** Maximum retry attempts for failed requests */
  MAX_RETRIES: 2,

  /** HTTP status codes that trigger retry */
  RETRY_STATUS_CODES: [502, 503, 504],

  /** Circuit breaker failure threshold */
  CIRCUIT_BREAKER_THRESHOLD: 5,
};

// =============================================================================
// UI CONFIGURATION
// =============================================================================

export const UI = {
  /** Toast/notification duration in ms */
  TOAST_DURATION: 5000,

  /** Debounce delay for search inputs */
  SEARCH_DEBOUNCE: 300,

  /** Debounce delay for form autosave */
  AUTOSAVE_DEBOUNCE: 1000,

  /** Animation duration for transitions */
  TRANSITION_DURATION: 200,

  /** Maximum characters for truncated text */
  TRUNCATE_LENGTH: 100,

  /** Maximum items in dropdown before virtualization */
  DROPDOWN_VIRTUALIZE_THRESHOLD: 100,
};

// =============================================================================
// FILE UPLOAD LIMITS
// =============================================================================

export const UPLOAD = {
  /** Maximum file size in bytes (10MB) */
  MAX_FILE_SIZE: 10 * 1024 * 1024,

  /** Maximum audio file size for voice input (6MB) */
  MAX_AUDIO_SIZE: 6 * 1024 * 1024,

  /** Allowed document extensions */
  ALLOWED_DOCUMENT_TYPES: ['.pdf', '.doc', '.docx', '.txt', '.md'],

  /** Allowed image extensions */
  ALLOWED_IMAGE_TYPES: ['.jpg', '.jpeg', '.png', '.gif', '.webp'],
};

// =============================================================================
// ENTITY STATUS VALUES
// =============================================================================

export const STATUS = {
  LEAD: {
    NEW: 'new',
    CONTACTED: 'contacted',
    QUALIFIED: 'qualified',
    CONVERTED: 'converted',
    LOST: 'lost',
  },
  OPPORTUNITY: {
    PROSPECTING: 'prospecting',
    QUALIFICATION: 'qualification',
    PROPOSAL: 'proposal',
    NEGOTIATION: 'negotiation',
    CLOSED_WON: 'closed_won',
    CLOSED_LOST: 'closed_lost',
  },
  ACTIVITY: {
    PLANNED: 'planned',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  CONTACT: {
    ACTIVE: 'active',
    INACTIVE: 'inactive',
  },
};

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

export const VALIDATION = {
  /** UUID v4 regex pattern */
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  /** Email regex pattern */
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  /** Phone regex pattern */
  PHONE_PATTERN: /^\+?[\d\s\-()]{7,20}$/,

  /** Max name length */
  MAX_NAME_LENGTH: 255,

  /** Max description length */
  MAX_DESCRIPTION_LENGTH: 5000,
};

// =============================================================================
// LOCAL STORAGE KEYS
// =============================================================================

export const STORAGE_KEYS = {
  TENANT_ID: 'tenant_id',
  SELECTED_TENANT_ID: 'selected_tenant_id',
  AUTH_TOKEN: 'auth_token',
  USER_PREFERENCES: 'user_preferences',
  SIDEBAR_COLLAPSED: 'sidebar_collapsed',
  THEME: 'theme',
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Validate if a string is a valid UUID
 * @param {string} str - String to validate
 * @returns {boolean}
 */
export function isValidUUID(str) {
  if (!str || typeof str !== 'string') return false;
  return VALIDATION.UUID_PATTERN.test(str);
}

/**
 * Validate if a string is a valid email
 * @param {string} str - String to validate
 * @returns {boolean}
 */
export function isValidEmail(str) {
  if (!str || typeof str !== 'string') return false;
  return VALIDATION.EMAIL_PATTERN.test(str);
}

/**
 * Parse limit with bounds checking
 * @param {string|number} value - Value to parse
 * @param {number} defaultLimit - Default if invalid
 * @param {number} maxLimit - Maximum allowed
 * @returns {number}
 */
export function parseLimit(value, defaultLimit = PAGINATION.DEFAULT_LIMIT, maxLimit = PAGINATION.MAX_LIMIT) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

export default {
  TIMEOUTS,
  CACHE,
  PAGINATION,
  API,
  UI,
  UPLOAD,
  STATUS,
  VALIDATION,
  STORAGE_KEYS,
  isValidUUID,
  isValidEmail,
  parseLimit,
};
