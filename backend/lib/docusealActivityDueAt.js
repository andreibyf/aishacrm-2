// @ts-check
/**
 * 4VD-33: helpers for the DocuSeal "follow up by" default on activity rows.
 *
 * The send route inserts an activity row when a document goes out for
 * signature; the row's due date defaults to next day at 5pm in the tenant's
 * timezone. Frontend can override via `due_date` + `due_time` in the request
 * body (both as wall-clock strings — no timezone conversion needed because
 * the activities table stores them as separate `date` + `time` columns).
 *
 * **Why split fields, not a single `due_at` timestamp?** The activities table
 * already has `due_date date` + `due_time time` columns — the convention
 * other routes (e.g., calcom-webhook.js) follow. Adding a `due_at timestamptz`
 * column would create a third date-storage path the rest of the system would
 * have to learn about. Use what's already there.
 *
 * No date library — uses stdlib `Intl.DateTimeFormat` for DST-correct
 * conversion between wall-clock-in-TZ and date/time string parts.
 */

/**
 * Try to read the tenant's timezone from the `tenant` table. Returns the
 * timezone string if present; otherwise null.
 *
 * Important: the table is `tenant` (SINGULAR), not `tenants`. Both prod and
 * staging schemas use the singular form. Plural-form tables (`tenant_integrations`,
 * `tenant_subscriptions`) are child tables.
 *
 * The tenant schema currently has NO `timezone` column on either prod or
 * staging — this helper is forward-looking. It returns null today, which
 * the caller correctly treats as "use UTC". When/if a `tenant.timezone`
 * column or `tenant.metadata->>'timezone'` value is added, this helper
 * picks it up automatically.
 *
 * @param {object} supabase
 * @param {string} tenantId
 * @returns {Promise<string|null>}
 */
export async function loadTenantTimezone(supabase, tenantId) {
  if (!supabase || !tenantId) return null;
  try {
    const { data, error } = await supabase
      .from('tenant')
      .select('timezone')
      .eq('id', tenantId)
      .maybeSingle();
    if (error) return null; // most likely "column tenant.timezone does not exist"
    const tz = data?.timezone;
    return typeof tz === 'string' && tz.length > 0 ? tz : null;
  } catch {
    return null;
  }
}

/**
 * Compute "next day at 5pm" in the given IANA timezone, returned as
 * separate `due_date` (YYYY-MM-DD) and `due_time` (HH:MM:SS) wall-clock
 * strings. Both reflect the tenant's local clock — `due_date` is tomorrow's
 * date in `timezone`, `due_time` is `17:00:00`.
 *
 * Why wall-clock-in-tz and not UTC: the activities table stores due_date
 * as a `date` column (no timezone) and due_time as a `time` column (no
 * timezone). The frontend renders them verbatim. Storing them in tenant
 * tz means the user reads "due tomorrow 5pm" — which is what the issue
 * spec calls for.
 *
 * @param {string} timezone - IANA TZ name (e.g., "America/New_York"). Defaults to "UTC".
 * @param {Date} [now] - injectable for tests
 * @returns {{due_date: string, due_time: string}}
 */
export function computeNextDay5pmFields(timezone = 'UTC', now = new Date()) {
  // Validate the timezone before formatting; an invalid TZ throws which
  // would break the send path. Fall back to UTC.
  let tz = timezone;
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: tz });
  } catch {
    tz = 'UTC';
  }

  // Today's date as it appears in the target timezone (en-CA gives YYYY-MM-DD).
  const todayInTz = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
  const [y, m, d] = todayInTz.split('-').map(Number);

  // Tomorrow's date. Use Date.UTC for safe month/year overflow handling.
  const tomorrow = new Date(Date.UTC(y, m - 1, d + 1));
  const due_date = `${tomorrow.getUTCFullYear()}-${String(tomorrow.getUTCMonth() + 1).padStart(2, '0')}-${String(tomorrow.getUTCDate()).padStart(2, '0')}`;

  return { due_date, due_time: '17:00:00' };
}

/**
 * Top-level convenience: load tenant timezone (or UTC) and return the
 * next-day-5pm fields as { due_date, due_time }.
 *
 * @param {object} supabase
 * @param {string} tenantId
 * @param {Date} [now] - injectable for tests
 * @returns {Promise<{due_date: string, due_time: string}>}
 */
export async function computeDocumentDueFields(supabase, tenantId, now = new Date()) {
  const tz = (await loadTenantTimezone(supabase, tenantId)) || 'UTC';
  return computeNextDay5pmFields(tz, now);
}
