/**
 * Outlook Calendar Service (Microsoft Graph API)
 *
 * Bidirectional sync between AiSHA CRM activities and Outlook Calendar.
 * Tenant OAuth credentials are stored in tenant_integrations:
 *   integration_type = 'outlook_calendar'
 *   api_credentials  = { access_token, refresh_token, token_expiry }
 *
 * Architecture: Personal Calendar (Outlook) ←→ AiSHA CRM ←→ Cal.com
 *
 * All functions are non-fatal. Callers should fire-and-forget with .catch(() => {}).
 */

import logger from './logger.js';
import { getSupabaseClient } from './supabase-db.js';

const MS_TOKEN_URL = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';
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
 * Fetch the tenant's Outlook Calendar integration from tenant_integrations.
 * Automatically refreshes the access_token if it is within 5 minutes of expiry.
 * Returns null if no active Outlook Calendar integration exists or credentials are incomplete.
 */
async function getTenantOutlookConfig(tenantId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('id, api_credentials')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'outlook_calendar')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const creds = data.api_credentials || {};
  if (!creds.access_token && !creds.refresh_token) return null;

  // Refresh if expired or within 5 minutes of expiry
  const expiryMs = creds.token_expiry ? new Date(creds.token_expiry).getTime() : 0;
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() >= expiryMs - fiveMinutes && creds.refresh_token) {
    const refreshed = await refreshOutlookToken(creds.refresh_token);
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
 * Refresh a Microsoft OAuth2 access token using the refresh token.
 */
async function refreshOutlookToken(refreshToken) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    logger.warn('[OutlookCalendar] MICROSOFT_CLIENT_ID/SECRET not configured');
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(MS_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        scope: 'Calendars.ReadWrite offline_access',
      }).toString(),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      logger.error('[OutlookCalendar] Token refresh failed', { status: res.status, body });
      return null;
    }
    return await res.json();
  } catch (err) {
    clearTimeout(timeout);
    logger.error('[OutlookCalendar] Token refresh request error', { message: err.message });
    return null;
  }
}

/**
 * Make an authenticated request to the Microsoft Graph API.
 */
async function graphFetch(accessToken, path, method = 'GET', body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(`${GRAPH_BASE}${path}`, {
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
// Internal: map CRM activity → Graph API event body
// ---------------------------------------------------------------------------

function activityToOutlookEvent(activity) {
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

  const isDateTime = startDt.includes('T');

  // Graph API event start/end format: { dateTime, timeZone } or { date } for all-day
  let start, end;
  if (isDateTime) {
    start = { dateTime: startDt, timeZone: 'UTC' };
    if (endDt) {
      end = { dateTime: endDt, timeZone: 'UTC' };
    } else {
      end = {
        dateTime: new Date(new Date(startDt).getTime() + 60 * 60 * 1000).toISOString(),
        timeZone: 'UTC',
      };
    }
  } else {
    // All-day
    start = { date: startDt.split('T')[0] };
    const d = new Date(startDt);
    d.setDate(d.getDate() + 1);
    end = { date: d.toISOString().split('T')[0] };
  }

  return {
    subject: title,
    body: { contentType: 'text', content: description },
    start,
    end,
    singleValueExtendedProperties: [
      {
        id: 'String {00020329-0000-0000-C000-000000000046} Name aisha_activity_id',
        value: String(activity.id),
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create an Outlook Calendar event for a CRM activity.
 * Stores the resulting outlook_event_id in activity.metadata (best-effort).
 */
export async function createOutlookEvent(tenantId, activity) {
  if (!SYNC_ACTIVITY_TYPES.has(activity.activity_type)) return;

  const config = await getTenantOutlookConfig(tenantId);
  if (!config) return;

  const eventBody = activityToOutlookEvent(activity);
  if (!eventBody) {
    logger.warn('[OutlookCalendar] createOutlookEvent: no start date on activity', { id: activity.id });
    return;
  }

  const { ok, status, data } = await graphFetch(
    config.accessToken,
    '/me/events',
    'POST',
    eventBody,
  );

  if (!ok) {
    logger.error('[OutlookCalendar] createOutlookEvent failed', {
      status,
      error: data?.error?.message,
      activityId: activity.id,
    });
    return;
  }

  const outlookEventId = data?.id;
  if (outlookEventId && activity.id) {
    const supabase = getSupabaseClient();
    const existingMeta = activity.metadata || {};
    await supabase
      .from('activities')
      .update({ metadata: { ...existingMeta, outlook_event_id: outlookEventId } })
      .eq('id', activity.id)
      .then(({ error }) => {
        if (error) logger.warn('[OutlookCalendar] Failed to store outlook_event_id', { error: error.message });
      });
  }

  logger.info('[OutlookCalendar] Event created', { activityId: activity.id, outlookEventId });
}

/**
 * Update an existing Outlook Calendar event for a CRM activity.
 * Falls back to create if no outlook_event_id is stored.
 */
export async function updateOutlookEvent(tenantId, activity) {
  if (!SYNC_ACTIVITY_TYPES.has(activity.activity_type)) return;

  const outlookEventId = activity.metadata?.outlook_event_id;
  if (!outlookEventId) {
    return createOutlookEvent(tenantId, activity);
  }

  const config = await getTenantOutlookConfig(tenantId);
  if (!config) return;

  const eventBody = activityToOutlookEvent(activity);
  if (!eventBody) return;

  // PATCH isn't ideal for Graph events; use PATCH with allowed fields
  const patchBody = {
    subject: eventBody.subject,
    body: eventBody.body,
    start: eventBody.start,
    end: eventBody.end,
  };

  const { ok, status, data } = await graphFetch(
    config.accessToken,
    `/me/events/${encodeURIComponent(outlookEventId)}`,
    'PATCH',
    patchBody,
  );

  if (!ok) {
    logger.error('[OutlookCalendar] updateOutlookEvent failed', {
      status,
      error: data?.error?.message,
      activityId: activity.id,
    });
  } else {
    logger.info('[OutlookCalendar] Event updated', { activityId: activity.id, outlookEventId });
  }
}

/**
 * Delete an Outlook Calendar event when a CRM activity is deleted.
 */
export async function deleteOutlookEvent(tenantId, activity) {
  const outlookEventId = activity.metadata?.outlook_event_id;
  if (!outlookEventId) return;

  const config = await getTenantOutlookConfig(tenantId);
  if (!config) return;

  const { ok, status, data } = await graphFetch(
    config.accessToken,
    `/me/events/${encodeURIComponent(outlookEventId)}`,
    'DELETE',
  );

  if (!ok && status !== 404) {
    // 404 = already deleted on Outlook side, safe to ignore
    logger.error('[OutlookCalendar] deleteOutlookEvent failed', {
      status,
      error: data?.error?.message,
      activityId: activity.id,
    });
  } else {
    logger.info('[OutlookCalendar] Event deleted', { activityId: activity.id, outlookEventId });
  }
}

/**
 * Pull Outlook Calendar events since `since` and upsert them as CRM activities.
 * Returns { imported, errors } counts.
 *
 * @param {string} tenantId
 * @param {string} [since] - ISO8601 date string; defaults to 30 days ago
 */
export async function importOutlookEvents(tenantId, since) {
  const config = await getTenantOutlookConfig(tenantId);
  if (!config) return { imported: 0, errors: 0 };

  const timeMin = since
    ? new Date(since).toISOString()
    : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  // Filter out events we previously tagged with aisha_activity_id via singleValueExtendedProperties
  const filter = `start/dateTime ge '${timeMin}'`;
  const params = new URLSearchParams({
    $filter: filter,
    $top: '250',
    $orderby: 'start/dateTime asc',
    $expand: "singleValueExtendedProperties($filter=id eq 'String {00020329-0000-0000-C000-000000000046} Name aisha_activity_id')",
  });

  const { ok, data } = await graphFetch(
    config.accessToken,
    `/me/events?${params.toString()}`,
  );

  if (!ok) {
    logger.error('[OutlookCalendar] importOutlookEvents list failed', { tenantId });
    return { imported: 0, errors: 1 };
  }

  const items = data?.value || [];

  // Filter out already-imported events (those with our extended property set)
  const toImport = items.filter((ev) => {
    const extProps = ev.singleValueExtendedProperties || [];
    return !extProps.some((p) => p.value && p.value !== '');
  });

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
        subject: ev.subject || 'Outlook Calendar Event',
        description: ev.body?.content || null,
        activity_date: startStr,
        due_date: startStr.split('T')[0],
        status: 'scheduled',
        metadata: {
          outlook_event_id: ev.id,
          source: 'outlook_calendar_import',
          start: startStr,
          end: endStr || null,
        },
      };

      const { error: insertErr } = await supabase
        .from('activities')
        .insert(activityData);

      if (insertErr) {
        logger.warn('[OutlookCalendar] importOutlookEvents: insert failed', { evId: ev.id, error: insertErr.message });
        errors++;
      } else {
        // Tag the Outlook event so future imports skip it
        await graphFetch(config.accessToken, `/me/events/${encodeURIComponent(ev.id)}`, 'PATCH', {
          singleValueExtendedProperties: [
            {
              id: 'String {00020329-0000-0000-C000-000000000046} Name aisha_activity_id',
              value: 'imported',
            },
          ],
        });
        imported++;
      }
    } catch (err) {
      logger.error('[OutlookCalendar] importOutlookEvents: error processing event', { evId: ev.id, message: err.message });
      errors++;
    }
  }

  logger.info('[OutlookCalendar] Import complete', { tenantId, imported, errors, total: items.length });
  return { imported, errors };
}
