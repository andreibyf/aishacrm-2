/**
 * Google Calendar Service
 *
 * Bidirectional sync between AiSHA CRM activities and Google Calendar.
 * Tenant OAuth credentials are stored in tenant_integrations:
 *   integration_type = 'google_calendar'
 *   api_credentials  = { access_token, refresh_token, token_expiry }
 *
 * Architecture: Personal Calendar (Google) ←→ AiSHA CRM ←→ Cal.com
 *
 * All functions are non-fatal. Callers should fire-and-forget with .catch(() => {}).
 */

import logger from './logger.js';
import { getSupabaseClient } from './supabase-db.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_CALENDAR_BASE = 'https://www.googleapis.com/calendar/v3';
const REQUEST_TIMEOUT_MS = 10000;

// Activity types that should sync to personal calendars
const SYNC_ACTIVITY_TYPES = new Set([
  'meeting',
  'call',
  'appointment',
  'booking_scheduled',
  'demo',
  'consultation',
]);

// ---------------------------------------------------------------------------
// Internal: fetch + token refresh
// ---------------------------------------------------------------------------

/**
 * Fetch the tenant's Google Calendar integration from tenant_integrations.
 * Automatically refreshes the access_token if it is within 5 minutes of expiry.
 * Returns null if no active Google Calendar integration exists or credentials are incomplete.
 */
async function getTenantGoogleConfig(tenantId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('id, api_credentials')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'google_calendar')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const creds = data.api_credentials || {};
  if (!creds.access_token && !creds.refresh_token) return null;

  // Refresh if expired or within 5 minutes of expiry
  const expiryMs = creds.token_expiry ? new Date(creds.token_expiry).getTime() : 0;
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() >= expiryMs - fiveMinutes && creds.refresh_token) {
    const refreshed = await refreshGoogleToken(creds.refresh_token);
    if (refreshed) {
      const updated = {
        ...creds,
        access_token: refreshed.access_token,
        token_expiry: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
      };
      await supabase
        .from('tenant_integrations')
        .update({ api_credentials: updated })
        .eq('id', data.id);
      return { accessToken: updated.access_token, integrationId: data.id };
    }
    // If refresh failed and token is fully expired, bail
    if (Date.now() >= expiryMs) return null;
  }

  return { accessToken: creds.access_token, integrationId: data.id };
}

/**
 * Refresh a Google OAuth2 access token using the refresh token.
 */
async function refreshGoogleToken(refreshToken) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logger.warn('[GoogleCalendar] GOOGLE_CLIENT_ID/SECRET not configured');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('[GoogleCalendar] Token refresh failed', { status: res.status, body });
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    logger.error('[GoogleCalendar] Token refresh request error', { message: err.message });
    return null;
  }
}

/**
 * Make an authenticated request to the Google Calendar API.
 */
async function googleFetch(accessToken, path, method = 'GET', body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GOOGLE_CALENDAR_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (res.status === 204) return { ok: true, status: 204, data: null };
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    clearTimeout(timeout);
    return { ok: false, status: 0, error: err.message };
  }
}

// ---------------------------------------------------------------------------
// Internal: map CRM activity → Google Calendar event body
// ---------------------------------------------------------------------------

function activityToGoogleEvent(activity) {
  const title = activity.subject || activity.title || 'CRM Activity';
  const description = [
    activity.description || activity.notes || '',
    activity.activity_type ? `Type: ${activity.activity_type}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const startDt = activity.activity_date || activity.start_time || activity.scheduled_start;
  const endDt = activity.end_time || activity.scheduled_end;

  if (!startDt) return null;

  // If we have a proper datetime, use it; otherwise treat as an all-day event
  const isDateTime = startDt.includes('T');

  const start = isDateTime
    ? { dateTime: startDt, timeZone: 'UTC' }
    : { date: startDt.split('T')[0] };

  let end;
  if (endDt) {
    end = isDateTime ? { dateTime: endDt, timeZone: 'UTC' } : { date: endDt.split('T')[0] };
  } else if (isDateTime) {
    // Default 1-hour duration
    end = { dateTime: new Date(new Date(startDt).getTime() + 60 * 60 * 1000).toISOString(), timeZone: 'UTC' };
  } else {
    // All-day event that ends on the same day
    const d = new Date(startDt);
    d.setDate(d.getDate() + 1);
    end = { date: d.toISOString().split('T')[0] };
  }

  return {
    summary: title,
    description,
    start,
    end,
    extendedProperties: {
      private: { aisha_activity_id: String(activity.id) },
    },
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create a Google Calendar event for a CRM activity.
 * Stores the resulting google_event_id in activity.metadata (best-effort).
 */
export async function createGoogleEvent(tenantId, activity) {
  if (!SYNC_ACTIVITY_TYPES.has(activity.activity_type)) return;

  const config = await getTenantGoogleConfig(tenantId);
  if (!config) return;

  const eventBody = activityToGoogleEvent(activity);
  if (!eventBody) {
    logger.warn('[GoogleCalendar] createGoogleEvent: no start date on activity', { id: activity.id });
    return;
  }

  const { ok, status, data } = await googleFetch(
    config.accessToken,
    '/calendars/primary/events',
    'POST',
    eventBody,
  );

  if (!ok) {
    logger.error('[GoogleCalendar] createGoogleEvent failed', { status, error: data?.error?.message, activityId: activity.id });
    return;
  }

  // Persist the google_event_id back into the activity metadata
  const googleEventId = data?.id;
  if (googleEventId && activity.id) {
    const supabase = getSupabaseClient();
    const existingMeta = activity.metadata || {};
    await supabase
      .from('activities')
      .update({ metadata: { ...existingMeta, google_event_id: googleEventId } })
      .eq('id', activity.id)
      .then(({ error }) => {
        if (error) logger.warn('[GoogleCalendar] Failed to store google_event_id', { error: error.message });
      });
  }

  logger.info('[GoogleCalendar] Event created', { activityId: activity.id, googleEventId });
}

/**
 * Update an existing Google Calendar event for a CRM activity.
 * Falls back to create if no google_event_id is stored.
 */
export async function updateGoogleEvent(tenantId, activity) {
  if (!SYNC_ACTIVITY_TYPES.has(activity.activity_type)) return;

  const googleEventId = activity.metadata?.google_event_id;
  if (!googleEventId) {
    // No event to update — create instead
    return createGoogleEvent(tenantId, activity);
  }

  const config = await getTenantGoogleConfig(tenantId);
  if (!config) return;

  const eventBody = activityToGoogleEvent(activity);
  if (!eventBody) return;

  const { ok, status, data } = await googleFetch(
    config.accessToken,
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    'PATCH',
    eventBody,
  );

  if (!ok) {
    logger.error('[GoogleCalendar] updateGoogleEvent failed', { status, error: data?.error?.message, activityId: activity.id });
  } else {
    logger.info('[GoogleCalendar] Event updated', { activityId: activity.id, googleEventId });
  }
}

/**
 * Delete a Google Calendar event when a CRM activity is deleted.
 */
export async function deleteGoogleEvent(tenantId, activity) {
  const googleEventId = activity.metadata?.google_event_id;
  if (!googleEventId) return;

  const config = await getTenantGoogleConfig(tenantId);
  if (!config) return;

  const { ok, status, data } = await googleFetch(
    config.accessToken,
    `/calendars/primary/events/${encodeURIComponent(googleEventId)}`,
    'DELETE',
  );

  if (!ok && status !== 410) {
    // 410 Gone = already deleted on Google side, safe to ignore
    logger.error('[GoogleCalendar] deleteGoogleEvent failed', { status, error: data?.error?.message, activityId: activity.id });
  } else {
    logger.info('[GoogleCalendar] Event deleted', { activityId: activity.id, googleEventId });
  }
}

/**
 * Pull Google Calendar events since `since` and upsert them as CRM activities.
 * Returns { imported, errors } counts.
 *
 * @param {string} tenantId
 * @param {string} [since] - ISO8601 date string; defaults to 30 days ago
 */
export async function importGoogleEvents(tenantId, since) {
  const config = await getTenantGoogleConfig(tenantId);
  if (!config) return { imported: 0, errors: 0 };

  const timeMin = since ? new Date(since).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    timeMin,
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
    privateExtendedProperty: 'aisha_activity_id=', // exclude already-imported events
  });

  const { ok, data } = await googleFetch(
    config.accessToken,
    `/calendars/primary/events?${params.toString()}`,
  );

  if (!ok) {
    logger.error('[GoogleCalendar] importGoogleEvents list failed', { tenantId });
    return { imported: 0, errors: 1 };
  }

  const items = data?.items || [];
  // Filter out events we already tagged with an aisha_activity_id
  const toImport = items.filter(
    (ev) => !ev.extendedProperties?.private?.aisha_activity_id,
  );

  const supabase = getSupabaseClient();
  let imported = 0;
  let errors = 0;

  for (const ev of toImport) {
    try {
      const startStr = ev.start?.dateTime || ev.start?.date;
      const endStr = ev.end?.dateTime || ev.end?.date;
      if (!startStr) continue;

      const activityData = {
        tenant_id: tenantId,
        activity_type: 'meeting',
        subject: ev.summary || 'Google Calendar Event',
        description: ev.description || null,
        activity_date: startStr,
        due_date: startStr.split('T')[0],
        status: 'scheduled',
        metadata: {
          google_event_id: ev.id,
          source: 'google_calendar_import',
          start: startStr,
          end: endStr || null,
        },
      };

      const { error: insertErr } = await supabase
        .from('activities')
        .insert(activityData);

      if (insertErr) {
        logger.warn('[GoogleCalendar] importGoogleEvents: insert failed', { evId: ev.id, error: insertErr.message });
        errors++;
      } else {
        // Tag the Google event so future imports skip it
        await googleFetch(config.accessToken, `/calendars/primary/events/${encodeURIComponent(ev.id)}`, 'PATCH', {
          extendedProperties: { private: { aisha_activity_id: 'imported' } },
        });
        imported++;
      }
    } catch (err) {
      logger.error('[GoogleCalendar] importGoogleEvents: error processing event', { evId: ev.id, message: err.message });
      errors++;
    }
  }

  logger.info('[GoogleCalendar] Import complete', { tenantId, imported, errors, total: items.length });
  return { imported, errors };
}
