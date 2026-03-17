import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import {
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
} from '../../lib/communications/contracts/syncStateContract.js';

describe('syncStateContract', () => {
  describe('validateSyncCursor', () => {
    it('accepts a valid UID cursor', () => {
      const result = validateSyncCursor({ strategy: 'uid', value: 12345 });
      assert.equal(result.valid, true);
    });

    it('accepts a delta_link cursor', () => {
      const result = validateSyncCursor({
        strategy: 'delta_link',
        value: 'https://graph.microsoft.com/delta?token=abc',
      });
      assert.equal(result.valid, true);
    });

    it('rejects null', () => {
      const result = validateSyncCursor(null);
      assert.equal(result.valid, false);
    });

    it('rejects unknown strategy', () => {
      const result = validateSyncCursor({ strategy: 'magic', value: 1 });
      assert.equal(result.valid, false);
      assert.ok(result.errors[0].includes('must be one of'));
    });

    it('rejects missing value', () => {
      const result = validateSyncCursor({ strategy: 'uid' });
      assert.equal(result.valid, false);
    });
  });

  describe('validateSyncState', () => {
    it('accepts a valid empty state (pre-first-poll)', () => {
      const result = validateSyncState({ cursor: null, replay_enabled: true });
      assert.equal(result.valid, true);
    });

    it('accepts a full state', () => {
      const result = validateSyncState({
        cursor: { strategy: 'uid', value: 500 },
        raw_retention_days: 30,
        replay_enabled: true,
        last_polled_at: '2025-12-01T00:00:00Z',
      });
      assert.equal(result.valid, true);
    });

    it('rejects invalid retention days', () => {
      const result = validateSyncState({ raw_retention_days: -1 });
      assert.equal(result.valid, false);
    });

    it('rejects excessive retention days', () => {
      const result = validateSyncState({ raw_retention_days: 999 });
      assert.equal(result.valid, false);
    });

    it('rejects non-boolean replay_enabled', () => {
      const result = validateSyncState({ replay_enabled: 'yes' });
      assert.equal(result.valid, false);
    });

    it('rejects invalid last_polled_at', () => {
      const result = validateSyncState({ last_polled_at: 'not-a-date' });
      assert.equal(result.valid, false);
    });

    it('rejects invalid last_message_at', () => {
      const result = validateSyncState({ last_message_at: 'not-a-date' });
      assert.equal(result.valid, false);
    });

    it('rejects invalid updated_at', () => {
      const result = validateSyncState({ updated_at: 'garbage' });
      assert.equal(result.valid, false);
    });

    it('rejects invalid cursor_strategy', () => {
      const result = validateSyncState({ cursor_strategy: 'magic' });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('cursor_strategy')));
    });

    it('accepts valid cursor_strategy', () => {
      const result = validateSyncState({ cursor_strategy: 'uid' });
      assert.equal(result.valid, true);
    });

    it('rejects negative poll_errors', () => {
      const result = validateSyncState({ poll_errors: -1 });
      assert.equal(result.valid, false);
      assert.ok(result.errors.some((e) => e.includes('poll_errors')));
    });

    it('accepts valid poll_errors count', () => {
      const result = validateSyncState({ poll_errors: 3 });
      assert.equal(result.valid, true);
    });

    it('accepts a full state with all optional fields', () => {
      const result = validateSyncState({
        cursor: { strategy: 'uid', value: 500 },
        raw_retention_days: 30,
        replay_enabled: true,
        last_polled_at: '2025-12-01T00:00:00Z',
        last_message_at: '2025-12-01T00:00:00Z',
        updated_at: '2025-12-01T00:00:00Z',
        cursor_strategy: 'uid',
        poll_errors: 0,
      });
      assert.equal(result.valid, true);
    });
  });

  describe('validateRetentionPolicy', () => {
    it('accepts a valid policy', () => {
      const result = validateRetentionPolicy({
        raw_retention_days: 30,
        retain_raw_source: true,
        purge_after_replay: false,
      });
      assert.equal(result.valid, true);
    });

    it('rejects non-boolean retain_raw_source', () => {
      const result = validateRetentionPolicy({ retain_raw_source: 'yes' });
      assert.equal(result.valid, false);
    });

    it('rejects null', () => {
      const result = validateRetentionPolicy(null);
      assert.equal(result.valid, false);
    });
  });

  describe('buildDefaultSyncState', () => {
    it('builds state with UID strategy by default', () => {
      const state = buildDefaultSyncState();
      assert.equal(state.cursor, null);
      assert.equal(state.cursor_strategy, CURSOR_STRATEGIES.UID);
      assert.equal(state.raw_retention_days, DEFAULT_RAW_RETENTION_DAYS);
      assert.equal(state.replay_enabled, true);
      assert.equal(state.poll_errors, 0);
    });

    it('accepts strategy override', () => {
      const state = buildDefaultSyncState({ cursor_strategy: CURSOR_STRATEGIES.DELTA_LINK });
      assert.equal(state.cursor_strategy, 'delta_link');
    });
  });

  describe('buildRetentionPolicy', () => {
    it('builds default policy from empty config', () => {
      const policy = buildRetentionPolicy();
      assert.equal(policy.raw_retention_days, DEFAULT_RAW_RETENTION_DAYS);
      assert.equal(policy.retain_raw_source, true);
      assert.equal(policy.purge_after_replay, false);
    });

    it('respects configured retention days', () => {
      const policy = buildRetentionPolicy({ sync: { raw_retention_days: 7 } });
      assert.equal(policy.raw_retention_days, 7);
      assert.equal(policy.retain_raw_source, true);
    });

    it('sets retain_raw_source to false when days is 0', () => {
      const policy = buildRetentionPolicy({ sync: { raw_retention_days: 0 } });
      assert.equal(policy.raw_retention_days, 0);
      assert.equal(policy.retain_raw_source, false);
    });

    it('clamps excessive days to max', () => {
      const policy = buildRetentionPolicy({ sync: { raw_retention_days: 9999 } });
      assert.equal(policy.raw_retention_days, MAX_RAW_RETENTION_DAYS);
    });
  });

  describe('isWithinReplayWindow', () => {
    it('returns true for recent message', () => {
      const now = new Date();
      const stored = new Date(now.getTime() - 1000 * 60 * 60); // 1 hour ago
      assert.equal(isWithinReplayWindow(stored.toISOString(), 30, now), true);
    });

    it('returns false for expired message', () => {
      const now = new Date();
      const stored = new Date(now.getTime() - 31 * 24 * 60 * 60 * 1000); // 31 days ago
      assert.equal(isWithinReplayWindow(stored.toISOString(), 30, now), false);
    });

    it('returns false when retention is 0', () => {
      assert.equal(isWithinReplayWindow(new Date().toISOString(), 0), false);
    });

    it('returns false for null timestamp', () => {
      assert.equal(isWithinReplayWindow(null, 30), false);
    });
  });

  describe('constants', () => {
    it('exports all cursor strategies', () => {
      assert.equal(CURSOR_STRATEGIES.UID, 'uid');
      assert.equal(CURSOR_STRATEGIES.DELTA_LINK, 'delta_link');
      assert.equal(CURSOR_STRATEGIES.HISTORY_ID, 'history_id');
      assert.equal(CURSOR_STRATEGIES.PAGE_TOKEN, 'page_token');
      assert.equal(CURSOR_STRATEGIES.TIMESTAMP, 'timestamp');
    });

    it('exports retention bounds', () => {
      assert.equal(MIN_RAW_RETENTION_DAYS, 0);
      assert.equal(MAX_RAW_RETENTION_DAYS, 365);
      assert.equal(DEFAULT_RAW_RETENTION_DAYS, 30);
    });
  });
});
