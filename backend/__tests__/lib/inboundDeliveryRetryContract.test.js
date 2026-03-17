import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from '../../lib/communications/contracts/inboundDeliveryRetryContract.js';

describe('inboundDeliveryRetryContract', () => {
  // -----------------------------------------------------------------------
  // Constants
  // -----------------------------------------------------------------------
  describe('constants', () => {
    it('exports all retry strategies', () => {
      assert.equal(RETRY_STRATEGY.EXPONENTIAL_BACKOFF, 'exponential_backoff');
      assert.equal(RETRY_STRATEGY.LINEAR_BACKOFF, 'linear_backoff');
      assert.equal(RETRY_STRATEGY.FIXED_DELAY, 'fixed_delay');
      assert.equal(RETRY_STRATEGY.NO_RETRY, 'no_retry');
    });

    it('exports all delivery statuses', () => {
      assert.equal(DELIVERY_STATUS.PENDING, 'pending');
      assert.equal(DELIVERY_STATUS.DELIVERED, 'delivered');
      assert.equal(DELIVERY_STATUS.FAILED_RETRYABLE, 'failed_retryable');
      assert.equal(DELIVERY_STATUS.FAILED_PERMANENT, 'failed_permanent');
      assert.equal(DELIVERY_STATUS.BOUNCED, 'bounced');
      assert.equal(DELIVERY_STATUS.DEFERRED, 'deferred');
    });

    it('exports error categories', () => {
      assert.equal(ERROR_CATEGORY.TRANSIENT, 'transient');
      assert.equal(ERROR_CATEGORY.PERMANENT, 'permanent');
      assert.equal(ERROR_CATEGORY.UNKNOWN, 'unknown');
    });

    it('exports audit event types', () => {
      assert.equal(AUDIT_EVENT_TYPE.INBOUND_RECEIVED, 'inbound_received');
      assert.equal(AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT, 'delivery_attempt');
      assert.equal(AUDIT_EVENT_TYPE.DELIVERY_SUCCESS, 'delivery_success');
      assert.equal(AUDIT_EVENT_TYPE.DELIVERY_FAILED, 'delivery_failed');
      assert.equal(AUDIT_EVENT_TYPE.RETRY_SCHEDULED, 'retry_scheduled');
      assert.equal(AUDIT_EVENT_TYPE.RETRY_ABANDONED, 'retry_abandoned');
      assert.equal(AUDIT_EVENT_TYPE.MANUALLY_RETRIED, 'manually_retried');
    });

    it('exports default constants', () => {
      assert.equal(DEFAULT_MAX_RETRIES, 5);
      assert.equal(DEFAULT_INITIAL_BACKOFF_SECONDS, 5);
      assert.equal(DEFAULT_MAX_BACKOFF_SECONDS, 3600);
    });
  });

  // -----------------------------------------------------------------------
  // buildRetryConfig
  // -----------------------------------------------------------------------
  describe('buildRetryConfig', () => {
    it('builds sensible defaults', () => {
      const config = buildRetryConfig();
      assert.equal(config.strategy, RETRY_STRATEGY.EXPONENTIAL_BACKOFF);
      assert.equal(config.max_retries, 5);
      assert.equal(config.initial_backoff_seconds, 5);
      assert.equal(config.max_backoff_seconds, 3600);
    });

    it('accepts overrides', () => {
      const config = buildRetryConfig({
        strategy: RETRY_STRATEGY.LINEAR_BACKOFF,
        max_retries: 3,
        initial_backoff_seconds: 10,
      });
      assert.equal(config.strategy, RETRY_STRATEGY.LINEAR_BACKOFF);
      assert.equal(config.max_retries, 3);
      assert.equal(config.initial_backoff_seconds, 10);
    });
  });

  // -----------------------------------------------------------------------
  // buildDeliveryState
  // -----------------------------------------------------------------------
  describe('buildDeliveryState', () => {
    it('builds initial state', () => {
      const state = buildDeliveryState();
      assert.equal(state.status, DELIVERY_STATUS.PENDING);
      assert.equal(state.retry_count, 0);
      assert.deepEqual(state.attempts, []);
      assert.equal(state.next_retry_at, null);
      assert.equal(state.first_attempt_at, null);
      assert.equal(state.last_attempt_at, null);
      assert.equal(state.resolved_at, null);
      assert.ok(state.retry_config);
    });

    it('accepts status override', () => {
      const state = buildDeliveryState({ status: DELIVERY_STATUS.DEFERRED });
      assert.equal(state.status, DELIVERY_STATUS.DEFERRED);
    });
  });

  // -----------------------------------------------------------------------
  // buildAuditEvent
  // -----------------------------------------------------------------------
  describe('buildAuditEvent', () => {
    it('builds a valid audit event', () => {
      const event = buildAuditEvent(AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT, 'inbound-worker', { attempt: 1 });
      assert.equal(event.type, AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT);
      assert.equal(event.actor, 'inbound-worker');
      assert.ok(event.timestamp);
      assert.equal(event.details.attempt, 1);
    });

    it('defaults details to empty object', () => {
      const event = buildAuditEvent(AUDIT_EVENT_TYPE.INBOUND_RECEIVED, 'webhook');
      assert.deepEqual(event.details, {});
    });

    it('accepts explicit timestamp via options', () => {
      const ts = '2025-01-01T00:00:00.000Z';
      const event = buildAuditEvent(AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT, 'worker', {}, { timestamp: ts });
      assert.equal(event.timestamp, ts);
    });
  });

  // -----------------------------------------------------------------------
  // buildDeliveryAttempt
  // -----------------------------------------------------------------------
  describe('buildDeliveryAttempt', () => {
    it('builds success attempt', () => {
      const attempt = buildDeliveryAttempt(1, 'success');
      assert.equal(attempt.number, 1);
      assert.equal(attempt.status, 'success');
      assert.equal(attempt.error_code, null);
      assert.equal(attempt.error_category, null);
    });

    it('builds failed attempt with error classification', () => {
      const attempt = buildDeliveryAttempt(2, 'failed', { code: 'TIMEOUT', message: 'Connection timed out' });
      assert.equal(attempt.number, 2);
      assert.equal(attempt.status, 'failed');
      assert.equal(attempt.error_code, 'TIMEOUT');
      assert.equal(attempt.error_message, 'Connection timed out');
      assert.equal(attempt.error_category, ERROR_CATEGORY.TRANSIENT);
    });

    it('accepts explicit timestamp via options', () => {
      const ts = '2025-06-01T12:00:00.000Z';
      const attempt = buildDeliveryAttempt(1, 'success', null, { timestamp: ts });
      assert.equal(attempt.timestamp, ts);
    });
  });

  // -----------------------------------------------------------------------
  // validateRetryConfig
  // -----------------------------------------------------------------------
  describe('validateRetryConfig', () => {
    it('accepts valid config', () => {
      const result = validateRetryConfig(buildRetryConfig());
      assert.equal(result.valid, true);
      assert.equal(result.errors.length, 0);
    });

    it('rejects null', () => {
      const result = validateRetryConfig(null);
      assert.equal(result.valid, false);
    });

    it('rejects invalid strategy', () => {
      const result = validateRetryConfig({ strategy: 'random' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('strategy')));
    });

    it('rejects negative max_retries', () => {
      const result = validateRetryConfig({ max_retries: -1 });
      assert.equal(result.valid, false);
    });

    it('rejects initial_backoff > max_backoff', () => {
      const result = validateRetryConfig({ initial_backoff_seconds: 100, max_backoff_seconds: 10 });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('must not exceed')));
    });

    it('accepts empty object', () => {
      const result = validateRetryConfig({});
      assert.equal(result.valid, true);
    });
  });

  // -----------------------------------------------------------------------
  // validateDeliveryState
  // -----------------------------------------------------------------------
  describe('validateDeliveryState', () => {
    it('accepts valid state', () => {
      const result = validateDeliveryState(buildDeliveryState());
      assert.equal(result.valid, true);
    });

    it('rejects null', () => {
      const result = validateDeliveryState(null);
      assert.equal(result.valid, false);
    });

    it('rejects invalid status', () => {
      const result = validateDeliveryState({ status: 'exploded' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('status')));
    });

    it('rejects invalid next_retry_at', () => {
      const result = validateDeliveryState({ status: 'pending', next_retry_at: 'not-a-date' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('next_retry_at')));
    });

    it('propagates retry_config errors', () => {
      const result = validateDeliveryState({ status: 'pending', retry_config: { strategy: 'bogus' } });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('retry_config')));
    });

    it('rejects invalid resolved_at', () => {
      const result = validateDeliveryState({ status: 'pending', resolved_at: 'not-a-date' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('resolved_at')));
    });

    it('accepts null resolved_at', () => {
      const result = validateDeliveryState({ status: 'pending', resolved_at: null });
      assert.equal(result.valid, true);
    });
  });

  // -----------------------------------------------------------------------
  // validateAuditEvent
  // -----------------------------------------------------------------------
  describe('validateAuditEvent', () => {
    it('accepts valid event', () => {
      const event = buildAuditEvent(AUDIT_EVENT_TYPE.DELIVERY_SUCCESS, 'worker');
      const result = validateAuditEvent(event);
      assert.equal(result.valid, true);
    });

    it('rejects null', () => {
      const result = validateAuditEvent(null);
      assert.equal(result.valid, false);
    });

    it('rejects invalid type', () => {
      const result = validateAuditEvent({ type: 'explosion', actor: 'test', timestamp: new Date().toISOString() });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('type')));
    });

    it('rejects empty actor', () => {
      const result = validateAuditEvent({ type: AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT, actor: '', timestamp: new Date().toISOString() });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('actor')));
    });
  });

  // -----------------------------------------------------------------------
  // classifyErrorCategory
  // -----------------------------------------------------------------------
  describe('classifyErrorCategory', () => {
    it('classifies TIMEOUT as transient', () => {
      assert.equal(classifyErrorCategory('TIMEOUT'), ERROR_CATEGORY.TRANSIENT);
    });

    it('classifies RATE_LIMITED as transient', () => {
      assert.equal(classifyErrorCategory('RATE_LIMITED'), ERROR_CATEGORY.TRANSIENT);
    });

    it('classifies ECONNRESET as transient', () => {
      assert.equal(classifyErrorCategory('ECONNRESET'), ERROR_CATEGORY.TRANSIENT);
    });

    it('classifies AUTH_FAILED as permanent', () => {
      assert.equal(classifyErrorCategory('AUTH_FAILED'), ERROR_CATEGORY.PERMANENT);
    });

    it('classifies INVALID_RECIPIENT as permanent', () => {
      assert.equal(classifyErrorCategory('INVALID_RECIPIENT'), ERROR_CATEGORY.PERMANENT);
    });

    it('classifies unknown codes as unknown', () => {
      assert.equal(classifyErrorCategory('FLUX_CAPACITOR_OVERLOAD'), ERROR_CATEGORY.UNKNOWN);
    });

    it('classifies null/undefined as unknown', () => {
      assert.equal(classifyErrorCategory(null), ERROR_CATEGORY.UNKNOWN);
      assert.equal(classifyErrorCategory(undefined), ERROR_CATEGORY.UNKNOWN);
    });

    it('is case-insensitive', () => {
      assert.equal(classifyErrorCategory('timeout'), ERROR_CATEGORY.TRANSIENT);
      assert.equal(classifyErrorCategory('Timeout'), ERROR_CATEGORY.TRANSIENT);
    });
  });

  // -----------------------------------------------------------------------
  // shouldRetry
  // -----------------------------------------------------------------------
  describe('shouldRetry', () => {
    it('returns true for transient error below max', () => {
      assert.equal(shouldRetry('TIMEOUT', 0, 5), true);
    });

    it('returns false for permanent error', () => {
      assert.equal(shouldRetry('AUTH_FAILED', 0, 5), false);
    });

    it('returns false when retries exhausted', () => {
      assert.equal(shouldRetry('TIMEOUT', 5, 5), false);
    });

    it('returns true for unknown error below max', () => {
      assert.equal(shouldRetry('WEIRD_ERROR', 2, 5), true);
    });

    it('returns false for unknown error at max', () => {
      assert.equal(shouldRetry('WEIRD_ERROR', 5, 5), false);
    });

    it('defaults maxRetries to DEFAULT_MAX_RETRIES when omitted', () => {
      assert.equal(shouldRetry('TIMEOUT', 0), true);
      assert.equal(shouldRetry('TIMEOUT', DEFAULT_MAX_RETRIES), false);
    });
  });

  // -----------------------------------------------------------------------
  // calculateBackoffSeconds
  // -----------------------------------------------------------------------
  describe('calculateBackoffSeconds', () => {
    it('exponential: 5, 10, 20, 40, 80', () => {
      const config = { strategy: 'exponential_backoff', initial_backoff_seconds: 5, max_backoff_seconds: 3600 };
      assert.equal(calculateBackoffSeconds(0, config), 5);
      assert.equal(calculateBackoffSeconds(1, config), 10);
      assert.equal(calculateBackoffSeconds(2, config), 20);
      assert.equal(calculateBackoffSeconds(3, config), 40);
      assert.equal(calculateBackoffSeconds(4, config), 80);
    });

    it('linear: 5, 10, 15, 20, 25', () => {
      const config = { strategy: 'linear_backoff', initial_backoff_seconds: 5, max_backoff_seconds: 3600 };
      assert.equal(calculateBackoffSeconds(0, config), 5);
      assert.equal(calculateBackoffSeconds(1, config), 10);
      assert.equal(calculateBackoffSeconds(2, config), 15);
      assert.equal(calculateBackoffSeconds(3, config), 20);
      assert.equal(calculateBackoffSeconds(4, config), 25);
    });

    it('fixed_delay always returns initial_backoff', () => {
      const config = { strategy: 'fixed_delay', initial_backoff_seconds: 30 };
      assert.equal(calculateBackoffSeconds(0, config), 30);
      assert.equal(calculateBackoffSeconds(5, config), 30);
    });

    it('no_retry returns 0', () => {
      const config = { strategy: 'no_retry' };
      assert.equal(calculateBackoffSeconds(0, config), 0);
    });

    it('caps at max_backoff_seconds', () => {
      const config = { strategy: 'exponential_backoff', initial_backoff_seconds: 100, max_backoff_seconds: 500 };
      assert.equal(calculateBackoffSeconds(0, config), 100);
      assert.equal(calculateBackoffSeconds(1, config), 200);
      assert.equal(calculateBackoffSeconds(2, config), 400);
      assert.equal(calculateBackoffSeconds(3, config), 500); // capped
    });
  });

  // -----------------------------------------------------------------------
  // calculateNextRetryAt
  // -----------------------------------------------------------------------
  describe('calculateNextRetryAt', () => {
    it('returns ISO timestamp offset by backoff', () => {
      const base = '2025-03-17T10:00:00.000Z';
      const result = calculateNextRetryAt(base, 0, { strategy: 'exponential_backoff', initial_backoff_seconds: 5 });
      assert.equal(result, '2025-03-17T10:00:05.000Z');
    });

    it('second retry has larger offset', () => {
      const base = '2025-03-17T10:00:00.000Z';
      const result = calculateNextRetryAt(base, 1, { strategy: 'exponential_backoff', initial_backoff_seconds: 5 });
      assert.equal(result, '2025-03-17T10:00:10.000Z');
    });

    it('returns null for no_retry strategy', () => {
      const result = calculateNextRetryAt('2025-03-17T10:00:00.000Z', 0, { strategy: 'no_retry' });
      assert.equal(result, null);
    });

    it('returns null for invalid date', () => {
      const result = calculateNextRetryAt('not-a-date', 0);
      assert.equal(result, null);
    });
  });

  // -----------------------------------------------------------------------
  // parseRetryAfterHeader
  // -----------------------------------------------------------------------
  describe('parseRetryAfterHeader', () => {
    it('parses delta-seconds', () => {
      assert.equal(parseRetryAfterHeader('120'), 120);
    });

    it('parses zero', () => {
      assert.equal(parseRetryAfterHeader('0'), 0);
    });

    it('returns null for empty string', () => {
      assert.equal(parseRetryAfterHeader(''), null);
    });

    it('returns null for null', () => {
      assert.equal(parseRetryAfterHeader(null), null);
    });

    it('returns null for non-string', () => {
      assert.equal(parseRetryAfterHeader(123), null);
    });

    it('parses HTTP-date format', () => {
      // A date in the past relative to the injected now should return 0
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      const pastDate = 'Sun, 15 Jun 2025 11:59:00 GMT';
      assert.equal(parseRetryAfterHeader(pastDate, { now }), 0);
    });

    it('parses HTTP-date in the future', () => {
      const now = new Date('2025-06-15T12:00:00Z').getTime();
      const futureDate = 'Sun, 15 Jun 2025 12:02:00 GMT';
      assert.equal(parseRetryAfterHeader(futureDate, { now }), 120);
    });
  });

  // -----------------------------------------------------------------------
  // applyDeliverySuccess
  // -----------------------------------------------------------------------
  describe('applyDeliverySuccess', () => {
    it('transitions state to delivered', () => {
      const state = buildDeliveryState();
      const now = '2025-03-17T10:01:00.000Z';
      const result = applyDeliverySuccess(state, now);
      assert.equal(result.status, DELIVERY_STATUS.DELIVERED);
      assert.equal(result.resolved_at, now);
      assert.equal(result.next_retry_at, null);
      assert.equal(result.attempts.length, 1);
      assert.equal(result.attempts[0].status, 'success');
    });

    it('does not mutate original state', () => {
      const state = buildDeliveryState();
      const now = '2025-03-17T10:01:00.000Z';
      applyDeliverySuccess(state, now);
      assert.equal(state.status, DELIVERY_STATUS.PENDING);
      assert.equal(state.attempts.length, 0);
    });

    it('preserves first_attempt_at if already set', () => {
      const state = buildDeliveryState({ first_attempt_at: '2025-03-17T09:00:00.000Z' });
      const result = applyDeliverySuccess(state, '2025-03-17T10:01:00.000Z');
      assert.equal(result.first_attempt_at, '2025-03-17T09:00:00.000Z');
    });
  });

  // -----------------------------------------------------------------------
  // applyDeliveryFailure
  // -----------------------------------------------------------------------
  describe('applyDeliveryFailure', () => {
    it('transitions to failed_retryable on transient error', () => {
      const state = buildDeliveryState();
      const now = '2025-03-17T10:01:00.000Z';
      const result = applyDeliveryFailure(state, now, { code: 'TIMEOUT', message: 'Timed out' });
      assert.equal(result.status, DELIVERY_STATUS.FAILED_RETRYABLE);
      assert.equal(result.retry_count, 1);
      assert.ok(result.next_retry_at);
      assert.equal(result.resolved_at, null);
    });

    it('transitions to failed_permanent on permanent error', () => {
      const state = buildDeliveryState();
      const now = '2025-03-17T10:01:00.000Z';
      const result = applyDeliveryFailure(state, now, { code: 'AUTH_FAILED', message: 'Bad creds' });
      assert.equal(result.status, DELIVERY_STATUS.FAILED_PERMANENT);
      assert.equal(result.resolved_at, now);
      assert.equal(result.next_retry_at, null);
      assert.equal(result.final_error_code, 'AUTH_FAILED');
    });

    it('transitions to failed_permanent when retries exhausted', () => {
      const state = buildDeliveryState({ retry_count: 5 });
      const now = '2025-03-17T10:01:00.000Z';
      const result = applyDeliveryFailure(state, now, { code: 'TIMEOUT', message: 'Timed out' });
      assert.equal(result.status, DELIVERY_STATUS.FAILED_PERMANENT);
      assert.equal(result.next_retry_at, null);
      assert.equal(result.resolved_at, now);
    });

    it('does not mutate original state', () => {
      const state = buildDeliveryState();
      applyDeliveryFailure(state, '2025-03-17T10:01:00.000Z', { code: 'TIMEOUT', message: 'err' });
      assert.equal(state.status, DELIVERY_STATUS.PENDING);
      assert.equal(state.retry_count, 0);
    });

    it('records attempt in attempts array', () => {
      const state = buildDeliveryState();
      const result = applyDeliveryFailure(state, '2025-03-17T10:01:00.000Z', { code: 'TIMEOUT', message: 'err' });
      assert.equal(result.attempts.length, 1);
      assert.equal(result.attempts[0].error_code, 'TIMEOUT');
      assert.equal(result.attempts[0].error_category, ERROR_CATEGORY.TRANSIENT);
    });

    it('next_retry_at grows with exponential backoff', () => {
      let state = buildDeliveryState();
      const t1 = '2025-03-17T10:00:00.000Z';
      state = applyDeliveryFailure(state, t1, { code: 'TIMEOUT', message: 'err' });
      const retry1 = new Date(state.next_retry_at).getTime() - new Date(t1).getTime();

      const t2 = state.next_retry_at;
      state = applyDeliveryFailure(state, t2, { code: 'TIMEOUT', message: 'err' });
      const retry2 = new Date(state.next_retry_at).getTime() - new Date(t2).getTime();

      assert.ok(retry2 > retry1, `Second backoff (${retry2}ms) should be larger than first (${retry1}ms)`);
    });

    it('handles null error gracefully', () => {
      const state = buildDeliveryState();
      const now = '2025-03-17T10:01:00.000Z';
      const result = applyDeliveryFailure(state, now, null);
      assert.equal(result.status, DELIVERY_STATUS.FAILED_RETRYABLE);
      assert.equal(result.attempts[0].error_code, null);
      assert.equal(result.attempts[0].error_category, ERROR_CATEGORY.UNKNOWN);
    });

    it('normalizes partial retry_config via buildRetryConfig', () => {
      const state = buildDeliveryState({ retry_config: { strategy: 'linear_backoff' } });
      // max_retries is not set on the raw config, but buildRetryConfig fills it in
      const now = '2025-03-17T10:01:00.000Z';
      const result = applyDeliveryFailure(state, now, { code: 'TIMEOUT', message: 'err' });
      // Should retry because max_retries defaults to 5 via buildRetryConfig
      assert.equal(result.status, DELIVERY_STATUS.FAILED_RETRYABLE);
    });
  });

  // -----------------------------------------------------------------------
  // appendAuditEvent
  // -----------------------------------------------------------------------
  describe('appendAuditEvent', () => {
    it('appends to empty log', () => {
      const event = buildAuditEvent(AUDIT_EVENT_TYPE.INBOUND_RECEIVED, 'webhook');
      const log = appendAuditEvent([], event);
      assert.equal(log.length, 1);
      assert.equal(log[0].type, AUDIT_EVENT_TYPE.INBOUND_RECEIVED);
    });

    it('appends to existing log', () => {
      const event1 = buildAuditEvent(AUDIT_EVENT_TYPE.INBOUND_RECEIVED, 'webhook');
      const event2 = buildAuditEvent(AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT, 'worker');
      const log = appendAuditEvent([event1], event2);
      assert.equal(log.length, 2);
    });

    it('does not mutate original array', () => {
      const original = [buildAuditEvent(AUDIT_EVENT_TYPE.INBOUND_RECEIVED, 'webhook')];
      appendAuditEvent(original, buildAuditEvent(AUDIT_EVENT_TYPE.DELIVERY_ATTEMPT, 'worker'));
      assert.equal(original.length, 1);
    });

    it('handles null/undefined input', () => {
      const event = buildAuditEvent(AUDIT_EVENT_TYPE.INBOUND_RECEIVED, 'webhook');
      const log = appendAuditEvent(null, event);
      assert.equal(log.length, 1);
    });
  });

  // -----------------------------------------------------------------------
  // summarizeDeliveryState
  // -----------------------------------------------------------------------
  describe('summarizeDeliveryState', () => {
    it('summarizes empty state', () => {
      const summary = summarizeDeliveryState(null);
      assert.equal(summary.total_attempts, 0);
      assert.equal(summary.failed_count, 0);
      assert.equal(summary.last_error, null);
      assert.equal(summary.status, 'unknown');
    });

    it('summarizes state with failed attempts', () => {
      let state = buildDeliveryState();
      state = applyDeliveryFailure(state, '2025-03-17T10:00:00.000Z', { code: 'TIMEOUT', message: 'err' });
      state = applyDeliveryFailure(state, '2025-03-17T10:00:05.000Z', { code: 'RATE_LIMITED', message: 'throttled' });

      const summary = summarizeDeliveryState(state);
      assert.equal(summary.total_attempts, 2);
      assert.equal(summary.failed_count, 2);
      assert.equal(summary.last_error, 'RATE_LIMITED');
      assert.equal(summary.status, DELIVERY_STATUS.FAILED_RETRYABLE);
      assert.ok(summary.next_retry_at);
    });

    it('summarizes delivered state', () => {
      let state = buildDeliveryState();
      state = applyDeliverySuccess(state, '2025-03-17T10:01:00.000Z');

      const summary = summarizeDeliveryState(state);
      assert.equal(summary.total_attempts, 1);
      assert.equal(summary.failed_count, 0);
      assert.equal(summary.status, DELIVERY_STATUS.DELIVERED);
      assert.equal(summary.next_retry_at, null);
    });
  });
});
