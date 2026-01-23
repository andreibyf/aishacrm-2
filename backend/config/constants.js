/**
 * Centralized Constants Configuration
 *
 * All application constants should be defined here to ensure consistency
 * across the codebase and make configuration changes easier.
 *
 * Constants are organized by category and can be overridden via environment
 * variables where appropriate.
 */

// =============================================================================
// PAGINATION DEFAULTS
// =============================================================================

export const PAGINATION = {
  /** Default number of items per page for list endpoints */
  DEFAULT_LIMIT: 50,

  /** Default limit for search endpoints (smaller for faster response) */
  SEARCH_LIMIT: 25,

  /** Default limit for audit/log endpoints (larger for admin views) */
  AUDIT_LIMIT: 100,

  /** Maximum allowed limit to prevent excessive queries */
  MAX_LIMIT: 1000,

  /** Maximum limit for standard entity endpoints */
  MAX_ENTITY_LIMIT: 200,

  /** Maximum limit for search endpoints */
  MAX_SEARCH_LIMIT: 100,

  /** Default offset */
  DEFAULT_OFFSET: 0,
};

// =============================================================================
// CACHE TTL (Time To Live in seconds)
// =============================================================================

export const CACHE_TTL = {
  /** Short-lived cache for frequently changing data */
  SHORT: 60,

  /** Standard cache for entity lists (3 minutes) */
  STANDARD: 180,

  /** Medium cache for less frequently changing data */
  MEDIUM: 300,

  /** Long cache for rarely changing data (10 minutes) */
  LONG: 600,

  /** Audit/log cache (2 minutes) */
  AUDIT: 120,

  /** Cron jobs cache (4 minutes) */
  CRON: 240,

  /** System settings cache (5 minutes) */
  SETTINGS: 300,

  /** Tenant resolution cache (1 minute) */
  TENANT_RESOLVE: parseInt(process.env.TENANT_RESOLVE_CACHE_TTL_MS || '60000', 10),
};

// =============================================================================
// RATE LIMITING
// =============================================================================

export const RATE_LIMIT = {
  /** Default rate limit window in milliseconds (1 minute) */
  WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),

  /** Default max requests per window */
  MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),

  /** Route-specific rate limit window */
  ROUTE_WINDOW_MS: parseInt(process.env.ROUTE_RATE_WINDOW_MS || '60000', 10),

  /** Auth endpoint rate limit */
  AUTH_MAX: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '5', 10),

  /** Password reset rate limit */
  PASSWORD_MAX: parseInt(process.env.PASSWORD_RATE_LIMIT_MAX || '5', 10),

  /** User mutation rate limit */
  USER_MUTATE_MAX: parseInt(process.env.USER_MUTATE_RATE_LIMIT_MAX || '30', 10),

  /** Supabase proxy rate limit */
  SUPABASE_PROXY_MAX: parseInt(process.env.SUPABASE_PROXY_MAX_REQ || '30', 10),
};

// =============================================================================
// AI & LLM CONFIGURATION
// =============================================================================

export const AI = {
  /** Default temperature for chat completions */
  DEFAULT_TEMPERATURE: 0.4,

  /** Default max tool iterations */
  DEFAULT_TOOL_ITERATIONS: 5,

  /** Max audio bytes for speech-to-text */
  MAX_STT_AUDIO_BYTES: parseInt(process.env.MAX_STT_AUDIO_BYTES || '6000000', 10),

  /** Artifact metadata threshold in bytes */
  ARTIFACT_META_THRESHOLD_BYTES: parseInt(process.env.AI_ARTIFACT_META_THRESHOLD_BYTES || '8000', 10),

  /** Context enrichment timeout in ms */
  ENRICHMENT_TIMEOUT_MS: parseInt(process.env.AI_ENRICHMENT_TIMEOUT_MS || '500', 10),

  /** Slow query threshold for context enrichment */
  SLOW_THRESHOLD_MS: parseInt(process.env.AI_CONTEXT_SLOW_THRESHOLD_MS || '500', 10),

  /** Memory retrieval top-k results */
  MEMORY_TOP_K: parseInt(process.env.MEMORY_TOP_K || '8', 10),

  /** Max chunk characters for memory */
  MEMORY_MAX_CHUNK_CHARS: parseInt(process.env.MEMORY_MAX_CHUNK_CHARS || '3500', 10),

  /** Minimum similarity threshold for memory retrieval */
  MEMORY_MIN_SIMILARITY: parseFloat(process.env.MEMORY_MIN_SIMILARITY || '0.7'),

  /** Max incoming messages for context window */
  MAX_INCOMING_MESSAGES: 8,

  /** Max characters per message */
  MAX_MESSAGE_CHARS: 1500,
};

// =============================================================================
// FILE UPLOAD LIMITS
// =============================================================================

export const UPLOAD = {
  /** Max file size in bytes (10MB default) */
  MAX_FILE_SIZE: parseInt(process.env.MAX_UPLOAD_FILE_SIZE || '10485760', 10),

  /** Max audio file size for STT */
  MAX_AUDIO_SIZE: parseInt(process.env.MAX_STT_AUDIO_BYTES || '6000000', 10),

  /** Allowed file types for documents */
  ALLOWED_DOCUMENT_TYPES: ['pdf', 'doc', 'docx', 'txt', 'md'],

  /** Allowed image types */
  ALLOWED_IMAGE_TYPES: ['jpg', 'jpeg', 'png', 'gif', 'webp'],
};

// =============================================================================
// DATABASE & PERFORMANCE
// =============================================================================

export const DATABASE = {
  /** Default PostgreSQL port */
  DEFAULT_PORT: 5432,

  /** Performance log flush interval in ms */
  PERF_LOG_FLUSH_MS: parseInt(process.env.PERF_LOG_FLUSH_MS || '2000', 10),

  /** Performance log batch max size */
  PERF_LOG_BATCH_MAX: parseInt(process.env.PERF_LOG_BATCH_MAX || '25', 10),

  /** System logs max bulk batch size */
  SYSTEM_LOGS_MAX_BULK_BATCH: parseInt(process.env.SYSTEM_LOGS_MAX_BULK_BATCH || '200', 10),

  /** Query timeout in ms */
  QUERY_TIMEOUT_MS: parseInt(process.env.DB_QUERY_TIMEOUT_MS || '30000', 10),
};

// =============================================================================
// SYSTEM DEFAULTS
// =============================================================================

export const SYSTEM = {
  /** Default backend port */
  PORT: parseInt(process.env.BACKEND_PORT || process.env.PORT || '3001', 10),

  /** System user ID for automated operations */
  SYSTEM_USER_ID: process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000000',

  /** System tenant ID */
  SYSTEM_TENANT_ID: process.env.SYSTEM_TENANT_ID || '00000000-0000-0000-0000-000000000000',

  /** Health check interval in seconds */
  HEALTH_CHECK_INTERVAL_S: 300,

  /** Heartbeat interval in ms */
  HEARTBEAT_INTERVAL_MS: 120000,
};

// =============================================================================
// VALIDATION PATTERNS
// =============================================================================

export const VALIDATION = {
  /** UUID v4 regex pattern */
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  /** Email regex pattern */
  EMAIL_PATTERN: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,

  /** Phone regex pattern (basic) */
  PHONE_PATTERN: /^\+?[\d\s\-()]{7,20}$/,

  /** Max name length */
  MAX_NAME_LENGTH: 255,

  /** Max description length */
  MAX_DESCRIPTION_LENGTH: 5000,

  /** Max notes length */
  MAX_NOTES_LENGTH: 10000,
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
    PLANNED: 'planned',       // Legacy/AI flows - treated as 'scheduled'
    SCHEDULED: 'scheduled',   // Canonical status for pending activities
    IN_PROGRESS: 'in_progress',
    OVERDUE: 'overdue',       // Set by cron when due_date passes
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
  WORKER: {
    ACTIVE: 'Active',
    INACTIVE: 'Inactive',
    ON_LEAVE: 'On Leave',
  },
  PROJECT: {
    PLANNING: 'planning',
    ACTIVE: 'active',
    ON_HOLD: 'on_hold',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
  },
};

// =============================================================================
// HTTP STATUS CODES (for reference)
// =============================================================================

export const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  TOO_MANY_REQUESTS: 429,
  INTERNAL_SERVER_ERROR: 500,
  BAD_GATEWAY: 502,
  SERVICE_UNAVAILABLE: 503,
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Safely parse a limit parameter with bounds checking
 * @param {string|number} value - The limit value to parse
 * @param {number} defaultLimit - Default if value is invalid
 * @param {number} maxLimit - Maximum allowed limit
 * @returns {number}
 */
export function parseLimit(value, defaultLimit = PAGINATION.DEFAULT_LIMIT, maxLimit = PAGINATION.MAX_LIMIT) {
  const parsed = parseInt(value, 10);
  if (isNaN(parsed) || parsed < 1) return defaultLimit;
  return Math.min(parsed, maxLimit);
}

/**
 * Safely parse an offset parameter
 * @param {string|number} value - The offset value to parse
 * @returns {number}
 */
export function parseOffset(value) {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) || parsed < 0 ? PAGINATION.DEFAULT_OFFSET : parsed;
}

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

// Default export for convenience
export default {
  PAGINATION,
  CACHE_TTL,
  RATE_LIMIT,
  AI,
  UPLOAD,
  DATABASE,
  SYSTEM,
  VALIDATION,
  STATUS,
  HTTP_STATUS,
  parseLimit,
  parseOffset,
  isValidUUID,
  isValidEmail,
};
