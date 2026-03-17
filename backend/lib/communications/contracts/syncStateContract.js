/**
 * Sync State and Message Retention Contract
 *
 * Defines how AiSHA stores provider sync cursors, message fetch checkpoints,
 * replay metadata, and optional raw-message retention without assuming a
 * self-hosted mail store.
 *
 * Storage location: `tenant_integrations.metadata.communications.sync`
 *
 * ## Cursor model
 *
 * Every provider adapter returns a cursor after fetching inbound messages.
 * The cursor is opaque to AiSHA (its *value* is provider-specific) but its
 * *envelope* always conforms to the shape defined here.
 *
 * ## Retention policy
 *
 * Raw message source (MIME) is stored in `communications_messages.raw_source`.
 * Retention duration is configurable per-mailbox via
 * `config.sync.raw_retention_days`.  A value of `0` means "do not store raw
 * source at all".  The default is 30 days.
 *
 * ## Replay boundaries
 *
 * Replay re-processes stored messages through the inbound pipeline.  The
 * replay window is bounded by the retention period — messages whose raw
 * source has been purged cannot be replayed.
 */

// ---------------------------------------------------------------------------
// Cursor strategy constants
// ---------------------------------------------------------------------------

export const CURSOR_STRATEGIES = Object.freeze({
  UID: 'uid', // IMAP UID
  DELTA_LINK: 'delta_link', // Microsoft Graph delta links
  HISTORY_ID: 'history_id', // Gmail history ID
  PAGE_TOKEN: 'page_token', // Generic page token (webhook-push providers)
  TIMESTAMP: 'timestamp', // Fallback: ISO-8601 timestamp of newest message
});

// ---------------------------------------------------------------------------
// Default retention constants
// ---------------------------------------------------------------------------

export const DEFAULT_RAW_RETENTION_DAYS = 30;
export const MIN_RAW_RETENTION_DAYS = 0; // 0 = no raw storage
export const MAX_RAW_RETENTION_DAYS = 365;

// ---------------------------------------------------------------------------
// Sync state shape validators
// ---------------------------------------------------------------------------

function isNonEmptyString(v) {
  return typeof v === 'string' && v.trim().length > 0;
}

function isValidISODate(v) {
  return typeof v === 'string' && !Number.isNaN(Date.parse(v));
}

/**
 * Validate a sync cursor envelope.
 *
 * Expected shape:
 * ```json
 * {
 *   "strategy": "uid",
 *   "value":    12345
 * }
 * ```
 */
export function validateSyncCursor(cursor) {
  const errors = [];

  if (typeof cursor !== 'object' || cursor === null) {
    return { valid: false, errors: ['sync cursor must be an object'] };
  }

  if (!isNonEmptyString(cursor.strategy)) {
    errors.push('cursor.strategy must be a non-empty string');
  } else if (!Object.values(CURSOR_STRATEGIES).includes(cursor.strategy)) {
    errors.push(`cursor.strategy must be one of: ${Object.values(CURSOR_STRATEGIES).join(', ')}`);
  }

  if (cursor.value === undefined || cursor.value === null) {
    errors.push('cursor.value is required');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate the full sync-state block stored in integration metadata.
 *
 * Expected shape (under `metadata.communications.sync`):
 * ```json
 * {
 *   "cursor": { "strategy": "uid", "value": 12345 },
 *   "cursor_strategy": "uid",
 *   "raw_retention_days": 30,
 *   "replay_enabled": true,
 *   "last_polled_at": "2025-12-01T00:00:00Z",
 *   "last_message_at": "2025-12-01T00:00:00Z",
 *   "updated_at": "2025-12-01T00:00:00Z",
 *   "poll_errors": 0
 * }
 * ```
 */
export function validateSyncState(state) {
  const errors = [];

  if (typeof state !== 'object' || state === null) {
    return { valid: false, errors: ['sync state must be an object'] };
  }

  // cursor is optional (null before first successful poll)
  if (state.cursor !== undefined && state.cursor !== null) {
    const cursorResult = validateSyncCursor(state.cursor);
    if (!cursorResult.valid) {
      errors.push(...cursorResult.errors);
    }
  }

  if (state.raw_retention_days !== undefined && state.raw_retention_days !== null) {
    if (
      !Number.isInteger(state.raw_retention_days) ||
      state.raw_retention_days < MIN_RAW_RETENTION_DAYS ||
      state.raw_retention_days > MAX_RAW_RETENTION_DAYS
    ) {
      errors.push(
        `raw_retention_days must be an integer between ${MIN_RAW_RETENTION_DAYS} and ${MAX_RAW_RETENTION_DAYS}`,
      );
    }
  }

  if (
    state.last_polled_at !== undefined &&
    state.last_polled_at !== null &&
    !isValidISODate(state.last_polled_at)
  ) {
    errors.push('last_polled_at must be a valid ISO-8601 date string');
  }

  if (
    state.last_message_at !== undefined &&
    state.last_message_at !== null &&
    !isValidISODate(state.last_message_at)
  ) {
    errors.push('last_message_at must be a valid ISO-8601 date string');
  }

  if (
    state.updated_at !== undefined &&
    state.updated_at !== null &&
    !isValidISODate(state.updated_at)
  ) {
    errors.push('updated_at must be a valid ISO-8601 date string');
  }

  if (typeof state.replay_enabled !== 'undefined' && typeof state.replay_enabled !== 'boolean') {
    errors.push('replay_enabled must be a boolean when provided');
  }

  if (
    state.cursor_strategy !== undefined &&
    state.cursor_strategy !== null
  ) {
    if (!isNonEmptyString(state.cursor_strategy)) {
      errors.push('cursor_strategy must be a non-empty string when provided');
    } else if (!Object.values(CURSOR_STRATEGIES).includes(state.cursor_strategy)) {
      errors.push(
        `cursor_strategy must be one of: ${Object.values(CURSOR_STRATEGIES).join(', ')}`,
      );
    }
  }

  if (
    state.poll_errors !== undefined &&
    state.poll_errors !== null &&
    (!Number.isInteger(state.poll_errors) || state.poll_errors < 0)
  ) {
    errors.push('poll_errors must be a non-negative integer when provided');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Validate a message retention policy block.
 *
 * Expected shape (from normalized config):
 * ```json
 * {
 *   "raw_retention_days": 30,
 *   "retain_raw_source": true,
 *   "purge_after_replay": false
 * }
 * ```
 */
export function validateRetentionPolicy(policy) {
  const errors = [];

  if (typeof policy !== 'object' || policy === null) {
    return { valid: false, errors: ['retention policy must be an object'] };
  }

  if (policy.raw_retention_days !== undefined && policy.raw_retention_days !== null) {
    if (
      !Number.isInteger(policy.raw_retention_days) ||
      policy.raw_retention_days < MIN_RAW_RETENTION_DAYS ||
      policy.raw_retention_days > MAX_RAW_RETENTION_DAYS
    ) {
      errors.push(
        `raw_retention_days must be an integer between ${MIN_RAW_RETENTION_DAYS} and ${MAX_RAW_RETENTION_DAYS}`,
      );
    }
  }

  if (policy.retain_raw_source !== undefined && typeof policy.retain_raw_source !== 'boolean') {
    errors.push('retain_raw_source must be a boolean when provided');
  }

  if (policy.purge_after_replay !== undefined && typeof policy.purge_after_replay !== 'boolean') {
    errors.push('purge_after_replay must be a boolean when provided');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a default sync-state block for a new integration.
 */
export function buildDefaultSyncState(overrides = {}) {
  return {
    cursor: null,
    cursor_strategy: overrides.cursor_strategy || CURSOR_STRATEGIES.UID,
    raw_retention_days: overrides.raw_retention_days ?? DEFAULT_RAW_RETENTION_DAYS,
    replay_enabled: overrides.replay_enabled !== false,
    last_polled_at: null,
    last_message_at: null,
    updated_at: new Date().toISOString(),
    poll_errors: 0,
  };
}

/**
 * Build a default retention policy from config.
 */
export function buildRetentionPolicy(config = {}) {
  const sync = config.sync || {};
  const days = Number.isInteger(sync.raw_retention_days)
    ? Math.max(MIN_RAW_RETENTION_DAYS, Math.min(MAX_RAW_RETENTION_DAYS, sync.raw_retention_days))
    : DEFAULT_RAW_RETENTION_DAYS;

  return {
    raw_retention_days: days,
    retain_raw_source: days > 0,
    purge_after_replay: false,
  };
}

/**
 * Determine whether a stored message is within the replay window.
 *
 * @param {string} messageStoredAt  ISO-8601 timestamp when message was persisted
 * @param {number} retentionDays    Configured retention period
 * @param {Date}   [now]            Reference date (defaults to Date.now)
 * @returns {boolean}
 */
export function isWithinReplayWindow(messageStoredAt, retentionDays, now) {
  if (!messageStoredAt || retentionDays <= 0) return false;

  const storedMs = Date.parse(messageStoredAt);
  if (Number.isNaN(storedMs)) return false;

  const reference = now instanceof Date ? now.getTime() : Date.now();
  const windowMs = retentionDays * 24 * 60 * 60 * 1000;
  return reference - storedMs <= windowMs;
}

export default {
  CURSOR_STRATEGIES,
  DEFAULT_RAW_RETENTION_DAYS,
  MIN_RAW_RETENTION_DAYS,
  MAX_RAW_RETENTION_DAYS,
  validateSyncCursor,
  validateSyncState,
  validateRetentionPolicy,
  buildDefaultSyncState,
  buildRetentionPolicy,
  isWithinReplayWindow,
};
