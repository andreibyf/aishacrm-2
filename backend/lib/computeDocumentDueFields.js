// @ts-check
/**
 * computeDocumentDueFields (4VD-43 day 4 — replaces the deleted
 * docusealActivityDueAt.js).
 *
 * For a signing-request activity, the "Follow up by" field defaults to
 * tomorrow at 5pm in the tenant's local timezone, then is split into the
 * activities table's `due_date` (date) + `due_time` (time without timezone)
 * columns — wall-clock strings, no offset.
 *
 * Pure stdlib (Intl.DateTimeFormat). Handles DST transitions correctly
 * because Intl computes the offset for the target instant per zone.
 *
 * If the tenant row has no `timezone` column or the value is invalid the
 * function falls back to UTC. Failure to load the tenant row is treated
 * as UTC as well — the activity still gets a due date, just at UTC 5pm
 * instead of tenant-local 5pm.
 */

import logger from './logger.js';

const FALLBACK_TZ = 'UTC';

/**
 * Format a Date as { date: 'YYYY-MM-DD', time: 'HH:mm:ss' } in the given
 * IANA timezone. Pure helper.
 *
 * @param {Date} d
 * @param {string} timeZone
 * @returns {{ date: string, time: string }}
 */
export function formatInTimeZone(d, timeZone) {
  // Intl returns parts that we can stitch together — avoids the "is the
  // server in UTC?" land-mine that toISOString() trips on.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  const parts = fmt.formatToParts(d).reduce((acc, p) => {
    acc[p.type] = p.value;
    return acc;
  }, /** @type {Record<string, string>} */ ({}));
  const date = `${parts.year}-${parts.month}-${parts.day}`;
  // Intl's hour part can return '24' for the moment exactly midnight on
  // some locales; coerce.
  const hour = parts.hour === '24' ? '00' : parts.hour;
  const time = `${hour}:${parts.minute}:${parts.second}`;
  return { date, time };
}

/**
 * Compute "tomorrow at 5pm in tenant local time" expressed as a wall-clock
 * date + time pair suitable for the activities table.
 *
 * @param {string} timeZone   IANA zone, e.g. 'America/New_York'
 * @param {Date}   [now]      Override for tests
 * @returns {{ due_date: string, due_time: string }}
 */
export function computeNextDayFivePM(timeZone, now = new Date()) {
  // Step 1: figure out today's date in the target zone.
  const today = formatInTimeZone(now, timeZone).date; // 'YYYY-MM-DD'
  // Step 2: parse it back into a Date at midnight UTC, advance one
  // calendar day, then format the result in the target zone to get
  // tomorrow's local date label. (We don't use Date arithmetic alone
  // because DST springs forward / falls back — relying on the formatter
  // for the second pass keeps the wall-clock label correct.)
  const [y, m, d] = today.split('-').map((s) => parseInt(s, 10));
  // Construct the next-day instant at 5pm wall clock by stepping one day
  // forward from today's midnight UTC and formatting in the target zone
  // until the date label matches tomorrow's. For most zones this is
  // straightforward; for zones with a DST jump the format pass handles it.
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1, 12, 0, 0));
  const tomorrowDate = formatInTimeZone(tomorrow, timeZone).date;
  return { due_date: tomorrowDate, due_time: '17:00:00' };
}

/**
 * Async wrapper that loads the tenant timezone (best-effort) then computes
 * the due-date pair. On any error the function falls back to UTC.
 *
 * @param {object} supabase  service-role client
 * @param {string} tenantId
 * @returns {Promise<{ due_date: string, due_time: string }>}
 */
export async function computeDocumentDueFields(supabase, tenantId) {
  let tz = FALLBACK_TZ;
  try {
    // Conservative SELECT — older tenant rows may not have the timezone
    // column. We swallow PGRST204 (column does not exist) by checking the
    // error code, but the simpler path is to ask for it and tolerate null.
    const { data, error } = await supabase
      .from('tenant')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    if (!error && data?.timezone && typeof data.timezone === 'string') {
      tz = data.timezone.trim();
    }
  } catch (err) {
    logger.warn('[computeDocumentDueFields] tenant timezone lookup failed; using UTC', {
      tenantId,
      message: err?.message || String(err),
    });
  }

  // Validate the IANA zone — Intl throws on a bad zone, which would let an
  // operator-set "America/Foo" garbage value 500 the route. Test it once
  // and fall back to UTC on failure.
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    logger.warn('[computeDocumentDueFields] invalid timezone, using UTC', { tenantId, tz });
    tz = FALLBACK_TZ;
  }

  return computeNextDayFivePM(tz);
}
