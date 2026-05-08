/**
 * docusealActivityDueAt.test.js
 *
 * Tests for the 4VD-33 due-date helper. Pins:
 *   - Next-day-5pm date computation handles UTC, EST/EDT (DST), JST
 *   - Returns wall-clock {due_date, due_time} (not UTC ISO) — matches schema
 *   - Timezone validation falls back to UTC instead of throwing
 *   - loadTenantTimezone degrades gracefully when the column doesn't exist
 *
 * Run:
 *   cd backend && node --test __tests__/lib/docusealActivityDueAt.test.js
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  computeNextDay5pmFields,
  loadTenantTimezone,
  computeDocumentDueFields,
} from '../../lib/docusealActivityDueAt.js';

describe('computeNextDay5pmFields', () => {
  test('UTC: returns tomorrow at 17:00:00 wall-clock', () => {
    const out = computeNextDay5pmFields('UTC', new Date('2026-05-07T12:00:00.000Z'));
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('UTC: late evening UTC still rolls to next UTC day', () => {
    const out = computeNextDay5pmFields('UTC', new Date('2026-05-07T23:30:00.000Z'));
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('America/New_York summer (EDT): tomorrow in NYC tz', () => {
    // 2026-05-07 12:00 UTC = 08:00 EDT same day → tomorrow in NYC = 2026-05-08
    const out = computeNextDay5pmFields(
      'America/New_York',
      new Date('2026-05-07T12:00:00.000Z'),
    );
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('America/New_York: 03:00 UTC is still the previous day in NYC', () => {
    // 2026-05-08 03:00 UTC = 23:00 EDT 2026-05-07 → tomorrow in NYC = 2026-05-08
    const out = computeNextDay5pmFields(
      'America/New_York',
      new Date('2026-05-08T03:00:00.000Z'),
    );
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('Asia/Tokyo (UTC+9): tomorrow rolls based on JST clock', () => {
    // 2026-05-07 12:00 UTC = 21:00 JST same day → tomorrow JST = 2026-05-08
    const out = computeNextDay5pmFields('Asia/Tokyo', new Date('2026-05-07T12:00:00.000Z'));
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('Asia/Tokyo: late UTC may already be NEXT day in JST', () => {
    // 2026-05-07 16:00 UTC = 01:00 JST 2026-05-08 → "tomorrow JST" = 2026-05-09
    const out = computeNextDay5pmFields('Asia/Tokyo', new Date('2026-05-07T16:00:00.000Z'));
    assert.deepEqual(out, { due_date: '2026-05-09', due_time: '17:00:00' });
  });

  test('crosses month boundary correctly', () => {
    const out = computeNextDay5pmFields('UTC', new Date('2026-04-30T12:00:00.000Z'));
    assert.deepEqual(out, { due_date: '2026-05-01', due_time: '17:00:00' });
  });

  test('crosses year boundary correctly (Dec 31 → Jan 1)', () => {
    const out = computeNextDay5pmFields('UTC', new Date('2026-12-31T12:00:00.000Z'));
    assert.deepEqual(out, { due_date: '2027-01-01', due_time: '17:00:00' });
  });

  test('invalid timezone falls back to UTC instead of throwing', () => {
    const out = computeNextDay5pmFields(
      'Mars/Olympus',
      new Date('2026-05-07T12:00:00.000Z'),
    );
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('default timezone is UTC', () => {
    const out = computeNextDay5pmFields(undefined, new Date('2026-05-07T12:00:00.000Z'));
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('returns wall-clock 17:00:00 always (not a UTC instant)', () => {
    // Sanity: NYC summer (UTC-4) and Tokyo (UTC+9) both give the SAME due_time.
    // The fields are wall-clock in the tenant's tz, not a UTC offset.
    const ny = computeNextDay5pmFields(
      'America/New_York',
      new Date('2026-05-07T12:00:00.000Z'),
    );
    const tokyo = computeNextDay5pmFields(
      'Asia/Tokyo',
      new Date('2026-05-07T12:00:00.000Z'),
    );
    assert.equal(ny.due_time, '17:00:00');
    assert.equal(tokyo.due_time, '17:00:00');
  });
});

describe('loadTenantTimezone', () => {
  test('returns timezone string when tenants.timezone column is populated', async () => {
    const supabase = {
      from(table) {
        assert.equal(table, 'tenant');
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { timezone: 'America/Chicago' }, error: null }),
        };
      },
    };
    assert.equal(await loadTenantTimezone(supabase, 'tenant-uuid'), 'America/Chicago');
  });

  test('returns null when row exists but timezone is empty', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: { timezone: '' }, error: null }),
        };
      },
    };
    assert.equal(await loadTenantTimezone(supabase, 'tenant-uuid'), null);
  });

  test('returns null when supabase reports an error (column does not exist)', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({
            data: null,
            error: { message: 'column tenants.timezone does not exist' },
          }),
        };
      },
    };
    assert.equal(await loadTenantTimezone(supabase, 'tenant-uuid'), null);
  });

  test('returns null when supabase throws', async () => {
    const supabase = {
      from() {
        throw new Error('connection refused');
      },
    };
    assert.equal(await loadTenantTimezone(supabase, 'tenant-uuid'), null);
  });

  test('returns null on missing args', async () => {
    assert.equal(await loadTenantTimezone(null, 'tenant-uuid'), null);
    assert.equal(await loadTenantTimezone({}, ''), null);
  });
});

describe('computeDocumentDueFields — combined helper', () => {
  test('uses tenant timezone when available', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({
            data: { timezone: 'America/New_York' },
            error: null,
          }),
        };
      },
    };
    const out = await computeDocumentDueFields(
      supabase,
      'tenant-uuid',
      new Date('2026-05-07T12:00:00.000Z'),
    );
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });

  test('falls back to UTC when tenant has no timezone', async () => {
    const supabase = {
      from() {
        return {
          select() { return this; },
          eq() { return this; },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      },
    };
    const out = await computeDocumentDueFields(
      supabase,
      'tenant-uuid',
      new Date('2026-05-07T12:00:00.000Z'),
    );
    assert.deepEqual(out, { due_date: '2026-05-08', due_time: '17:00:00' });
  });
});
