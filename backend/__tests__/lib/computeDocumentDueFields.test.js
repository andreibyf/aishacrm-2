// @ts-check
/**
 * computeDocumentDueFields.test.js (4VD-43 day 4a)
 *
 * Pure-function tests for the next-day-5pm-in-tenant-tz helper. Async
 * wrapper covered separately in the integration tests on day 6 (it depends
 * on a live Supabase mock).
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  formatInTimeZone,
  computeNextDayFivePM,
} from '../../lib/computeDocumentDueFields.js';

// ---------------------------------------------------------------------------
// formatInTimeZone — sanity check on the Intl-based formatter
// ---------------------------------------------------------------------------

describe('formatInTimeZone', () => {
  test('UTC formats expected wall clock', () => {
    const out = formatInTimeZone(new Date('2026-05-09T17:30:00Z'), 'UTC');
    assert.equal(out.date, '2026-05-09');
    assert.equal(out.time, '17:30:00');
  });

  test('America/New_York EDT (UTC-4) shifts hour back 4', () => {
    // 17:30 UTC on May 9 (EDT, summer) -> 13:30 local
    const out = formatInTimeZone(new Date('2026-05-09T17:30:00Z'), 'America/New_York');
    assert.equal(out.date, '2026-05-09');
    assert.equal(out.time, '13:30:00');
  });

  test('Asia/Tokyo (UTC+9) shifts hour forward 9 and may roll the date', () => {
    const out = formatInTimeZone(new Date('2026-05-09T17:00:00Z'), 'Asia/Tokyo');
    assert.equal(out.date, '2026-05-10');
    assert.equal(out.time, '02:00:00');
  });

  test("Intl's 24-hour edge gets coerced to 00", () => {
    // Locale 'en-CA' returns '24' for the moment exactly midnight in some
    // implementations; the helper coerces. We can't reliably trigger that
    // path across all Node versions; just sanity-check that the time is
    // a real 0-23 hour.
    const out = formatInTimeZone(new Date('2026-05-09T00:00:00Z'), 'UTC');
    const [hour] = out.time.split(':');
    assert.ok(parseInt(hour, 10) >= 0 && parseInt(hour, 10) < 24);
  });
});

// ---------------------------------------------------------------------------
// computeNextDayFivePM
// ---------------------------------------------------------------------------

describe('computeNextDayFivePM', () => {
  test('UTC: today 2026-05-09 -> tomorrow 2026-05-10 17:00:00', () => {
    const out = computeNextDayFivePM('UTC', new Date('2026-05-09T12:00:00Z'));
    assert.equal(out.due_date, '2026-05-10');
    assert.equal(out.due_time, '17:00:00');
  });

  test('America/New_York: today 2026-05-09 (EDT) -> tomorrow 2026-05-10 17:00 local', () => {
    // 12:00 UTC on May 9 = 08:00 EDT on May 9 (still May 9 local).
    const out = computeNextDayFivePM(
      'America/New_York',
      new Date('2026-05-09T12:00:00Z'),
    );
    assert.equal(out.due_date, '2026-05-10');
    assert.equal(out.due_time, '17:00:00');
  });

  test('America/New_York late local: 23:30 EDT on May 9 -> still tomorrow May 10 (not May 11)', () => {
    // 03:30 UTC on May 10 = 23:30 EDT on May 9.
    const out = computeNextDayFivePM(
      'America/New_York',
      new Date('2026-05-10T03:30:00Z'),
    );
    assert.equal(out.due_date, '2026-05-10');
    assert.equal(out.due_time, '17:00:00');
  });

  test('Asia/Tokyo: midnight local 2026-05-10 -> tomorrow 2026-05-11', () => {
    // 15:00 UTC on May 9 = 00:00 JST on May 10.
    const out = computeNextDayFivePM('Asia/Tokyo', new Date('2026-05-09T15:00:00Z'));
    assert.equal(out.due_date, '2026-05-11');
    assert.equal(out.due_time, '17:00:00');
  });

  test('crosses month boundary (May 31 -> June 1)', () => {
    const out = computeNextDayFivePM('UTC', new Date('2026-05-31T12:00:00Z'));
    assert.equal(out.due_date, '2026-06-01');
    assert.equal(out.due_time, '17:00:00');
  });

  test('crosses year boundary (Dec 31 -> Jan 1)', () => {
    const out = computeNextDayFivePM('UTC', new Date('2026-12-31T12:00:00Z'));
    assert.equal(out.due_date, '2027-01-01');
    assert.equal(out.due_time, '17:00:00');
  });

  test('US spring-forward DST day (March 8 2026): tomorrow still computes 17:00 local', () => {
    // March 8 2026 is the Sunday clocks spring forward in US TZs.
    // 12:00 UTC = 08:00 EDT (post-shift). Tomorrow's local 17:00 EDT is
    // unaffected — DST jump is on today, not tomorrow. The point is just
    // that we don't 500.
    const out = computeNextDayFivePM(
      'America/New_York',
      new Date('2026-03-08T12:00:00Z'),
    );
    assert.equal(out.due_date, '2026-03-09');
    assert.equal(out.due_time, '17:00:00');
  });

  test('US fall-back DST day (Nov 1 2026)', () => {
    const out = computeNextDayFivePM(
      'America/New_York',
      new Date('2026-11-01T12:00:00Z'),
    );
    assert.equal(out.due_date, '2026-11-02');
    assert.equal(out.due_time, '17:00:00');
  });
});
