/**
 * Inbound Delivery Retry and Audit Trail Contract
 *
 * Defines retry strategies, delivery state envelopes, audit events, and
 * pure helpers that make inbound email delivery failures retryable and
 * auditable without duplicating message persistence.
 *
 * This contract is PURE and DETERMINISTIC:
 * - No database access
 * - No external API calls
 * - Same inputs always produce same outputs
 *
 * Dimensions:
 * - Retry strategy:    exponential_backoff | linear_backoff | fixed_delay | no_retry
 * - Delivery status:   pending | delivered | failed_retryable | failed_permanent | bounced | deferred
 * - Error categories:  transient | permanent | unknown
 * - Audit events:      structured append-only event log per message
 *
 * @module inboundDeliveryRetryContract
 */

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidISODate(v) {
  if (typeof v !== 'string') return false;
  const ts = Date.parse(v);
  return !Number.isNaN(ts);
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const RETRY_STRATEGY = Object.freeze({
  EXPONENTIAL_BACKOFF: 'exponential_backoff',
  LINEAR_BACKOFF: 'linear_backoff',
  FIXED_DELAY: 'fixed_delay',
  NO_RETRY: 'no_retry',
});

export const DELIVERY_STATUS = Object.freeze({
  PENDING: 'pending',
  DELIVERED: 'delivered',
  FAILED_RETRYABLE: 'failed_retryable',
  FAILED_PERMANENT: 'failed_permanent',
  BOUNCED: 'bounced',
  DEFERRED: 'deferred',
});

export const ERROR_CATEGORY = Object.freeze({
  TRANSIENT: 'transient',
  PERMANENT: 'permanent',
  UNKNOWN: 'unknown',
});

export const AUDIT_EVENT_TYPE = Object.freeze({
  INBOUND_RECEIVED: 'inbound_received',
  DELIVERY_ATTEMPT: 'delivery_attempt',
  DELIVERY_SUCCESS: 'delivery_success',
  DELIVERY_FAILED: 'delivery_failed',
  RETRY_SCHEDULED: 'retry_scheduled',
  RETRY_ABANDONED: 'retry_abandoned',
  MANUALLY_RETRIED: 'manually_retried',
});

// ---------------------------------------------------------------------------
// Retry timing defaults
// ---------------------------------------------------------------------------

export const DEFAULT_MAX_RETRIES = 5;
export const DEFAULT_INITIAL_BACKOFF_SECONDS = 5;
export const DEFAULT_MAX_BACKOFF_SECONDS = 3600; // 1 hour cap

// ---------------------------------------------------------------------------
// Transient error codes (retryable)
// ---------------------------------------------------------------------------

const TRANSIENT_ERROR_CODES = new Set([
  'TIMEOUT',
  'CONNECTION_RESET',
  'CONNECTION_REFUSED',
  'ECONNRESET',
  'ECONNREFUSED',
  'ETIMEDOUT',
  'RATE_LIMITED',
  'THROTTLED',
  'SERVICE_UNAVAILABLE',
  'BAD_GATEWAY',
  'GATEWAY_TIMEOUT',
  'TEMPORARY_FAILURE',
  'TRY_AGAIN',
  'RESOURCE_EXHAUSTED',
]);

const PERMANENT_ERROR_CODES = new Set([
  'INVALID_CREDENTIALS',
  'AUTH_FAILED',
  'PERMISSION_DENIED',
  'NOT_FOUND',
  'INVALID_RECIPIENT',
  'INVALID_MAILBOX',
  'BLOCKED',
  'POLICY_REJECTED',
  'MALFORMED_MESSAGE',
  'CONTENT_REJECTED',
]);

// ---------------------------------------------------------------------------
// Builders
// ---------------------------------------------------------------------------

/**
 * Build a default retry configuration.
 *
 * @param {object} [overrides]
 * @returns {object} Retry config
 */
export function buildRetryConfig(overrides = {}) {
  return {
    strategy: overrides.strategy || RETRY_STRATEGY.EXPONENTIAL_BACKOFF,
    max_retries: overrides.max_retries ?? DEFAULT_MAX_RETRIES,
    initial_backoff_seconds: overrides.initial_backoff_seconds ?? DEFAULT_INITIAL_BACKOFF_SECONDS,
    max_backoff_seconds: overrides.max_backoff_seconds ?? DEFAULT_MAX_BACKOFF_SECONDS,
  };
}

/**
 * Build an initial delivery state envelope for a new inbound message.
 *
 * @param {object} [overrides]
 * @returns {object} Delivery state envelope
 */
export function buildDeliveryState(overrides = {}) {
  const retryConfig = buildRetryConfig(overrides.retry_config);
  return {
    status: overrides.status || DELIVERY_STATUS.PENDING,
    retry_config: retryConfig,
    retry_count: overrides.retry_count ?? 0,
    attempts: overrides.attempts || [],
    next_retry_at: overrides.next_retry_at || null,
    first_attempt_at: overrides.first_attempt_at || null,
    last_attempt_at: overrides.last_attempt_at || null,
    resolved_at: overrides.resolved_at || null,
    final_error_code: overrides.final_error_code || null,
  };
}

/**
 * Build a structured audit event for the event log.
 *
 * @param {string} type  - One of AUDIT_EVENT_TYPE values
 * @param {string} actor - Who/what triggered the event (e.g. 'inbound-worker')
 * @param {object} [details] - Event-specific details
 * @returns {object} Audit event record
 */
export function buildAuditEvent(type, actor, details = {}, { timestamp } = {}) {
  return {
    type,
    actor,
    timestamp: timestamp || new Date().toISOString(),
    details,
  };
}

/**
 * Build a delivery attempt record.
 *
 * @param {number} attemptNumber
 * @param {string} status        - 'success' | 'failed'
 * @param {object} [error]       - Error details if status=failed
 * @param {string} [error.code]
 * @param {string} [error.message]
 * @returns {object} Attempt record
 */
export function buildDeliveryAttempt(attemptNumber, status, error = null, { timestamp } = {}) {
  return {
    number: attemptNumber,
    timestamp: timestamp || new Date().toISOString(),
    status,
    error_code: error?.code || null,
    error_message: error?.message || null,
    error_category: error?.code ? classifyErrorCategory(error.code) : null,
  };
}

// ---------------------------------------------------------------------------
// Validators
// ---------------------------------------------------------------------------

/**
 * Validate a retry configuration object.
 *
 * @param {object} config
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateRetryConfig(config) {
  const errors = [];

  if (!config || typeof config !== 'object') {
    return { valid: false, errors: ['Retry config must be a non-null object'] };
  }

  if (config.strategy && !Object.values(RETRY_STRATEGY).includes(config.strategy)) {
    errors.push(`strategy must be one of: ${Object.values(RETRY_STRATEGY).join(', ')}`);
  }

  if (config.max_retries !== undefined) {
    if (!Number.isInteger(config.max_retries) || config.max_retries < 0) {
      errors.push('max_retries must be a non-negative integer');
    }
  }

  if (config.initial_backoff_seconds !== undefined) {
    if (typeof config.initial_backoff_seconds !== 'number' || config.initial_backoff_seconds < 0) {
      errors.push('initial_backoff_seconds must be a non-negative number');
    }
  }

  if (config.max_backoff_seconds !== undefined) {
    if (typeof config.max_backoff_seconds !== 'number' || config.max_backoff_seconds < 0) {
      errors.push('max_backoff_seconds must be a non-negative number');
    }
  }

  if (
    typeof config.initial_backoff_seconds === 'number' &&
    typeof config.max_backoff_seconds === 'number' &&
    config.initial_backoff_seconds > config.max_backoff_seconds
  ) {
    errors.push('initial_backoff_seconds must not exceed max_backoff_seconds');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a delivery state envelope.
 *
 * @param {object} state
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateDeliveryState(state) {
  const errors = [];

  if (!state || typeof state !== 'object') {
    return { valid: false, errors: ['Delivery state must be a non-null object'] };
  }

  if (!Object.values(DELIVERY_STATUS).includes(state.status)) {
    errors.push(`status must be one of: ${Object.values(DELIVERY_STATUS).join(', ')}`);
  }

  if (state.retry_config) {
    const rc = validateRetryConfig(state.retry_config);
    if (!rc.valid) errors.push(...rc.errors.map((e) => `retry_config.${e}`));
  }

  if (state.retry_count !== undefined) {
    if (!Number.isInteger(state.retry_count) || state.retry_count < 0) {
      errors.push('retry_count must be a non-negative integer');
    }
  }

  if (state.attempts !== undefined && !Array.isArray(state.attempts)) {
    errors.push('attempts must be an array');
  }

  if (state.next_retry_at !== null && state.next_retry_at !== undefined && !isValidISODate(state.next_retry_at)) {
    errors.push('next_retry_at must be a valid ISO-8601 date or null');
  }

  if (state.first_attempt_at !== null && state.first_attempt_at !== undefined && !isValidISODate(state.first_attempt_at)) {
    errors.push('first_attempt_at must be a valid ISO-8601 date or null');
  }

  if (state.last_attempt_at !== null && state.last_attempt_at !== undefined && !isValidISODate(state.last_attempt_at)) {
    errors.push('last_attempt_at must be a valid ISO-8601 date or null');
  }

  if (state.resolved_at !== null && state.resolved_at !== undefined && !isValidISODate(state.resolved_at)) {
    errors.push('resolved_at must be a valid ISO-8601 date or null');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a single audit event.
 *
 * @param {object} event
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateAuditEvent(event) {
  const errors = [];

  if (!event || typeof event !== 'object') {
    return { valid: false, errors: ['Audit event must be a non-null object'] };
  }

  if (!Object.values(AUDIT_EVENT_TYPE).includes(event.type)) {
    errors.push(`type must be one of: ${Object.values(AUDIT_EVENT_TYPE).join(', ')}`);
  }

  if (!isNonEmptyString(event.actor)) {
    errors.push('actor must be a non-empty string');
  }

  if (!isValidISODate(event.timestamp)) {
    errors.push('timestamp must be a valid ISO-8601 date');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Error classification
// ---------------------------------------------------------------------------

/**
 * Classify an error code as transient, permanent, or unknown.
 *
 * @param {string} errorCode - Normalized error code (e.g. 'TIMEOUT', 'AUTH_FAILED')
 * @returns {string} One of ERROR_CATEGORY values
 */
export function classifyErrorCategory(errorCode) {
  if (!errorCode || typeof errorCode !== 'string') return ERROR_CATEGORY.UNKNOWN;
  const upper = errorCode.toUpperCase();
  if (TRANSIENT_ERROR_CODES.has(upper)) return ERROR_CATEGORY.TRANSIENT;
  if (PERMANENT_ERROR_CODES.has(upper)) return ERROR_CATEGORY.PERMANENT;
  return ERROR_CATEGORY.UNKNOWN;
}

/**
 * Determine whether a failed delivery should be retried.
 *
 * @param {string} errorCode   - The error code from the failed attempt
 * @param {number} retryCount  - Number of retries already attempted
 * @param {number} maxRetries  - Maximum retries allowed
 * @returns {boolean}
 */
export function shouldRetry(errorCode, retryCount, maxRetries = DEFAULT_MAX_RETRIES) {
  if (retryCount >= maxRetries) return false;
  const category = classifyErrorCategory(errorCode);
  // Only retry transient and unknown errors; never retry permanent
  return category !== ERROR_CATEGORY.PERMANENT;
}

// ---------------------------------------------------------------------------
// Backoff / retry timing (pure math)
// ---------------------------------------------------------------------------

/**
 * Calculate backoff delay in seconds for a given retry count and strategy.
 *
 * @param {number} retryCount       - 0-based retry count (0 = first retry)
 * @param {object} [config]         - Retry config from buildRetryConfig()
 * @returns {number} Delay in seconds (capped at max_backoff_seconds)
 */
export function calculateBackoffSeconds(retryCount, config = {}) {
  const { strategy, initial_backoff_seconds, max_backoff_seconds } = buildRetryConfig(config);

  if (strategy === RETRY_STRATEGY.NO_RETRY) return 0;

  let delay;
  switch (strategy) {
    case RETRY_STRATEGY.EXPONENTIAL_BACKOFF:
      delay = initial_backoff_seconds * Math.pow(2, retryCount);
      break;
    case RETRY_STRATEGY.LINEAR_BACKOFF:
      delay = initial_backoff_seconds * (retryCount + 1);
      break;
    case RETRY_STRATEGY.FIXED_DELAY:
      delay = initial_backoff_seconds;
      break;
    default:
      delay = initial_backoff_seconds;
  }

  return Math.min(delay, max_backoff_seconds);
}

/**
 * Calculate the next retry timestamp as ISO-8601 string.
 *
 * @param {string} lastAttemptAt  - ISO-8601 timestamp of last attempt
 * @param {number} retryCount     - 0-based current retry count
 * @param {object} [config]       - Retry config
 * @returns {string|null} ISO-8601 timestamp for next retry, or null if no_retry strategy
 */
export function calculateNextRetryAt(lastAttemptAt, retryCount, config = {}) {
  const resolved = buildRetryConfig(config);
  if (resolved.strategy === RETRY_STRATEGY.NO_RETRY) return null;

  const delaySeconds = calculateBackoffSeconds(retryCount, config);
  const base = new Date(lastAttemptAt);
  if (Number.isNaN(base.getTime())) return null;

  return new Date(base.getTime() + delaySeconds * 1000).toISOString();
}

/**
 * Parse a Retry-After header value into seconds.
 * Supports both delta-seconds ("120") and HTTP-date formats.
 *
 * @param {string} header - The Retry-After header value
 * @returns {number|null} Seconds to wait, or null if unparseable
 */
export function parseRetryAfterHeader(header, { now } = {}) {
  if (!header || typeof header !== 'string') return null;
  const trimmed = header.trim();

  // Try delta-seconds first
  const seconds = Number(trimmed);
  if (!Number.isNaN(seconds) && seconds >= 0) return Math.floor(seconds);

  // Try HTTP-date
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) {
    const diff = Math.floor((dateMs - (now ?? Date.now())) / 1000);
    return diff > 0 ? diff : 0;
  }

  return null;
}

// ---------------------------------------------------------------------------
// State transition helpers
// ---------------------------------------------------------------------------

/**
 * Apply a successful delivery to a delivery state envelope.
 * Returns a new state (immutable — does not mutate input).
 *
 * @param {object} state       - Current delivery state
 * @param {string} timestampNow - ISO-8601 current timestamp
 * @returns {object} Updated delivery state
 */
export function applyDeliverySuccess(state, timestampNow) {
  const attempt = {
    number: (state.retry_count || 0) + 1,
    timestamp: timestampNow,
    status: 'success',
    error_code: null,
    error_message: null,
    error_category: null,
  };

  return {
    ...state,
    status: DELIVERY_STATUS.DELIVERED,
    attempts: [...(state.attempts || []), attempt],
    last_attempt_at: timestampNow,
    first_attempt_at: state.first_attempt_at || timestampNow,
    resolved_at: timestampNow,
    next_retry_at: null,
  };
}

/**
 * Apply a failed delivery attempt to a delivery state envelope.
 * Determines whether to retry or abandon based on error category and config.
 * Returns a new state (immutable).
 *
 * @param {object} state        - Current delivery state
 * @param {string} timestampNow - ISO-8601 current timestamp
 * @param {object} error        - { code, message }
 * @returns {object} Updated delivery state with retry decision applied
 */
export function applyDeliveryFailure(state, timestampNow, error) {
  const safeError = error || { code: null, message: null };
  const config = buildRetryConfig(state.retry_config);
  const currentRetryCount = state.retry_count || 0;
  const category = classifyErrorCategory(safeError.code);

  const attempt = {
    number: currentRetryCount + 1,
    timestamp: timestampNow,
    status: 'failed',
    error_code: safeError.code || null,
    error_message: safeError.message || null,
    error_category: category,
  };

  const attempts = [...(state.attempts || []), attempt];
  const firstAttempt = state.first_attempt_at || timestampNow;

  if (shouldRetry(safeError.code, currentRetryCount, config.max_retries)) {
    const nextRetry = calculateNextRetryAt(timestampNow, currentRetryCount, config);
    return {
      ...state,
      status: DELIVERY_STATUS.FAILED_RETRYABLE,
      retry_count: currentRetryCount + 1,
      attempts,
      next_retry_at: nextRetry,
      first_attempt_at: firstAttempt,
      last_attempt_at: timestampNow,
      resolved_at: null,
      final_error_code: null,
    };
  }

  // Permanent failure or retries exhausted
  return {
    ...state,
    status: DELIVERY_STATUS.FAILED_PERMANENT,
    retry_count: currentRetryCount + 1,
    attempts,
    next_retry_at: null,
    first_attempt_at: firstAttempt,
    last_attempt_at: timestampNow,
    resolved_at: timestampNow,
    final_error_code: safeError.code || null,
  };
}

// ---------------------------------------------------------------------------
// Audit event log helpers
// ---------------------------------------------------------------------------

/**
 * Append an audit event to an event log array.
 * Returns a new array (immutable).
 *
 * @param {Array} eventLog   - Existing event log array
 * @param {object} event     - Audit event from buildAuditEvent()
 * @returns {Array} New event log with appended event
 */
export function appendAuditEvent(eventLog, event) {
  return [...(eventLog || []), event];
}

/**
 * Summarize delivery attempts from a delivery state for operator inspection.
 *
 * @param {object} state - Delivery state envelope
 * @returns {{ total_attempts: number, failed_count: number, last_error: string|null, status: string, next_retry_at: string|null }}
 */
export function summarizeDeliveryState(state) {
  if (!state) {
    return { total_attempts: 0, failed_count: 0, last_error: null, status: 'unknown', next_retry_at: null };
  }

  const attempts = state.attempts || [];
  const failed = attempts.filter((a) => a.status === 'failed');
  const lastFailed = failed.length > 0 ? failed[failed.length - 1] : null;

  return {
    total_attempts: attempts.length,
    failed_count: failed.length,
    last_error: lastFailed ? lastFailed.error_code : null,
    status: state.status || 'unknown',
    next_retry_at: state.next_retry_at || null,
  };
}

// ---------------------------------------------------------------------------
// Default export
// ---------------------------------------------------------------------------

export default {
  RETRY_STRATEGY,
  DELIVERY_STATUS,
  ERROR_CATEGORY,
  AUDIT_EVENT_TYPE,
  DEFAULT_MAX_RETRIES,
  DEFAULT_INITIAL_BACKOFF_SECONDS,
  DEFAULT_MAX_BACKOFF_SECONDS,
  buildRetryConfig,
  buildDeliveryState,
  buildAuditEvent,
  buildDeliveryAttempt,
  validateRetryConfig,
  validateDeliveryState,
  validateAuditEvent,
  classifyErrorCategory,
  shouldRetry,
  calculateBackoffSeconds,
  calculateNextRetryAt,
  parseRetryAfterHeader,
  applyDeliverySuccess,
  applyDeliveryFailure,
  appendAuditEvent,
  summarizeDeliveryState,
};
