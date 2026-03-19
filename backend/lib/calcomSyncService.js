/**
 * Cal.com 2-Way Sync Service
 *
 * Handles bidirectional sync between AiSHA CRM activities and Cal.com:
 *
 *   CRM → Cal.com  (this file)
 *     When a timed CRM activity (meeting/call/appointment) is created or updated,
 *     it creates a "blocker" booking in Cal.com to prevent double-booking.
 *     The Cal.com booking UID is stored in activity.metadata.calcom_block_uid so we
 *     can reschedule or cancel it when the CRM activity changes.
 *
 *   Cal.com → CRM  (calcom-webhook.js)
 *     Incoming Cal.com booking lifecycle webhooks create/update CRM activities and
 *     booking_sessions. pullCalcomBookings() provides a manual reconciliation pass
 *     for any bookings that arrived while the webhook was down.
 *
 * Target Architecture:
 *
 *   Personal Calendar (Google/Outlook) ←→ AiSHA CRM ←→ Cal.com
 *
 *   AiSHA CRM is the hub. Tenants connect their Google/Outlook calendar directly to
 *   AiSHA (via tenant_integrations), not to Cal.com. Cal.com communicates only with
 *   AiSHA CRM via webhooks + API. AiSHA owns all calendar state and mediates both sides.
 *
 *   Direction A — Client books via Cal.com:
 *     Cal.com booking → webhook → AiSHA CRM (Activity + booking_session created)
 *     AiSHA CRM → Google/Outlook API: creates event on organizer's personal calendar.  [TODO]
 *
 *   Direction B — Organizer creates CRM activity:
 *     AiSHA CRM Activity → pushActivityToCalcom() → Cal.com blocker booking  [IMPLEMENTED]
 *     AiSHA CRM → Google/Outlook API: creates event on organizer's personal calendar.  [TODO]
 *
 *   Direction C — Personal calendar blocks a slot:
 *     Google/Outlook → AiSHA CRM reads busy times via Google/Outlook API  [TODO]
 *     → AiSHA CRM communicates blocked slots to Cal.com as blockers.
 *
 *   Personal calendar sync (Directions A/B/C) requires a dedicated Google Calendar
 *   service (Google Calendar API) and Outlook service (Microsoft Graph API) to be
 *   built. The tenant_integrations table already stores the OAuth credentials.
 *   See: backend/lib/googleCalendarService.js (to be created)
 *        backend/lib/outlookCalendarService.js (to be created)
 *
 * Requirements:
 *   - Tenant has an active Cal.com integration in tenant_integrations
 *   - api_credentials.api_key  — Cal.com API key (required)
 *   - config.event_type_id     — Event Type ID for blocker bookings (required for CRM→Cal.com)
 *   - config.base_url          — Cal.com base URL (optional, default: https://app.cal.com)
 */

import logger from './logger.js';
import { getSupabaseClient } from './supabase-db.js';

// Activity types that represent time-blocked events and should sync to Cal.com
const SYNC_ACTIVITY_TYPES = new Set([
  'meeting',
  'call',
  'appointment',
  'booking_scheduled',
  'demo',
  'consultation',
]);

const CALCOM_TIMEOUT_MS = 8000;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the tenant's active Cal.com integration config from the DB.
 * Returns null if not configured or API key is missing.
 */
async function getTenantCalcomConfig(tenantId) {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('api_credentials, config')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'calcom')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const apiKey = data.api_credentials?.api_key;
  if (!apiKey) return null;

  const baseUrl = (data.config?.base_url || 'https://app.cal.com').replace(/\/$/, '');

  return {
    apiKey,
    eventTypeId: data.config?.event_type_id || null,
    baseUrl,
    config: data.config,
  };
}

/**
 * Make an authenticated request to the Cal.com v1 API.
 */
async function calcomFetch(baseUrl, path, method, apiKey, body) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CALCOM_TIMEOUT_MS);

  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const json = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data: json };
  } catch (err) {
    clearTimeout(timeout);
    throw err;
  }
}

/**
 * Should this activity be synced to Cal.com?
 * Only sync activities that have an explicit date+time (not all-day tasks).
 */
function isSyncableActivity(activity) {
  if (!activity.due_date || !activity.due_time) return false;
  if (!SYNC_ACTIVITY_TYPES.has(activity.type)) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Push a new or updated CRM activity to Cal.com as a blocker booking.
 *
 * - Creates a new Cal.com booking and stores its UID in activity.metadata.calcom_block_uid.
 * - If the activity already has a calcom_block_uid it reschedules that booking instead.
 * - Requires config.event_type_id to be set on the tenant's Cal.com integration.
 * - Non-fatal: logs errors but never throws. Activity CRUD should not be blocked.
 */
export async function pushActivityToCalcom(tenantId, activity) {
  if (!isSyncableActivity(activity)) return;

  try {
    const calcom = await getTenantCalcomConfig(tenantId);
    if (!calcom) return;

    if (!calcom.eventTypeId) {
      logger.debug('[CalcomSync] No event_type_id configured — skipping CRM→Cal.com push', {
        tenantId,
        activityId: activity.id,
      });
      return;
    }

    // Build start/end as ISO strings (CRM stores due_date as YYYY-MM-DD, due_time as HH:MM in UTC)
    const start = `${activity.due_date}T${activity.due_time}:00.000Z`;
    const durationMin = activity.duration_minutes || 60;
    const end = new Date(new Date(start).getTime() + durationMin * 60 * 1000).toISOString();

    const existingBlockUid = activity.metadata?.calcom_block_uid;

    if (existingBlockUid) {
      // Reschedule the existing Cal.com blocker booking
      const { ok, status, data } = await calcomFetch(
        calcom.baseUrl,
        `/api/v1/bookings/${existingBlockUid}/reschedule`,
        'PATCH',
        calcom.apiKey,
        { start, end, reason: 'CRM activity updated' },
      );

      if (!ok) {
        logger.warn('[CalcomSync] Failed to reschedule Cal.com block', {
          status,
          error: data?.message,
          uid: existingBlockUid,
        });
      } else {
        logger.debug('[CalcomSync] Rescheduled Cal.com block', { uid: existingBlockUid });
      }
      return;
    }

    // Create a new Cal.com blocker booking
    const blockerEmail = activity.related_email || `crm-block-${tenantId}@internal.aisha`;
    const blockerName = activity.subject || 'CRM Activity';

    const { ok, status, data: booking } = await calcomFetch(
      calcom.baseUrl,
      '/api/v1/bookings',
      'POST',
      calcom.apiKey,
      {
        eventTypeId: calcom.eventTypeId,
        start,
        end,
        name: blockerName,
        email: blockerEmail,
        timeZone: 'UTC',
        language: 'en',
        customInputs: [],
        metadata: { crm_activity_id: activity.id, crm_tenant_id: tenantId },
        responses: { name: blockerName, email: blockerEmail },
      },
    );

    if (ok && booking?.uid) {
      // Persist the Cal.com booking UID back into the CRM activity metadata
      const supabase = getSupabaseClient();
      const updatedMeta = { ...(activity.metadata || {}), calcom_block_uid: booking.uid };
      const { error: metaErr } = await supabase
        .from('activities')
        .update({ metadata: updatedMeta })
        .eq('id', activity.id)
        .eq('tenant_id', tenantId);

      if (metaErr) {
        logger.warn('[CalcomSync] Could not store calcom_block_uid in activity metadata', {
          error: metaErr.message,
          activityId: activity.id,
        });
      } else {
        logger.info('[CalcomSync] Created Cal.com block booking', {
          uid: booking.uid,
          activityId: activity.id,
        });
      }
    } else {
      logger.warn('[CalcomSync] Failed to create Cal.com block', {
        status,
        error: booking?.message,
        activityId: activity.id,
      });
    }
  } catch (err) {
    // Non-fatal — activity is already saved; log and continue
    logger.error('[CalcomSync] pushActivityToCalcom error (non-fatal)', {
      error: err.message,
      activityId: activity?.id,
      tenantId,
    });
  }
}

/**
 * Cancel the Cal.com blocker booking linked to a deleted or cancelled CRM activity.
 * Non-fatal.
 */
export async function removeActivityFromCalcom(tenantId, activity) {
  const blockUid = activity?.metadata?.calcom_block_uid;
  if (!blockUid) return;

  try {
    const calcom = await getTenantCalcomConfig(tenantId);
    if (!calcom) return;

    const { ok, status } = await calcomFetch(
      calcom.baseUrl,
      `/api/v1/bookings/${blockUid}/cancel`,
      'DELETE',
      calcom.apiKey,
      { cancellationReason: 'CRM activity removed' },
    );

    if (ok) {
      logger.info('[CalcomSync] Cancelled Cal.com block booking', { uid: blockUid });
    } else {
      logger.warn('[CalcomSync] Failed to cancel Cal.com block', { uid: blockUid, status });
    }
  } catch (err) {
    logger.error('[CalcomSync] removeActivityFromCalcom error (non-fatal)', {
      error: err.message,
      blockUid,
      tenantId,
    });
  }
}

/**
 * Pull upcoming bookings from the Cal.com API and reconcile with CRM booking_sessions.
 * Complements the webhook — handles any bookings that arrived while the webhook was down.
 *
 * @returns {{ synced: number, errors: string[] }}
 */
export async function pullCalcomBookings(tenantId) {
  const calcom = await getTenantCalcomConfig(tenantId);
  if (!calcom) return { synced: 0, errors: ['Cal.com integration not configured'] };

  const errors = [];
  let synced = 0;

  try {
    const { ok, data } = await calcomFetch(
      calcom.baseUrl,
      '/api/v1/bookings?status=upcoming&take=100',
      'GET',
      calcom.apiKey,
    );

    if (!ok) {
      return { synced, errors: [`Cal.com API error: ${data?.message || 'unknown'}`] };
    }

    const bookings = data?.bookings || [];
    const supabase = getSupabaseClient();

    for (const booking of bookings) {
      if (!booking.uid) continue;

      // Skip bookings we created ourselves as blockers (they have our CRM metadata)
      if (booking.metadata?.crm_activity_id) continue;

      const { data: existing } = await supabase
        .from('booking_sessions')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('calcom_booking_id', booking.uid)
        .maybeSingle();

      if (!existing) {
        const { error: upsertErr } = await supabase.from('booking_sessions').upsert(
          [
            {
              tenant_id: tenantId,
              calcom_booking_id: booking.uid,
              calcom_event_type_id: booking.eventTypeId || null,
              scheduled_start: booking.startTime,
              scheduled_end: booking.endTime,
              status: booking.status === 'cancelled' ? 'cancelled' : 'confirmed',
            },
          ],
          { onConflict: 'tenant_id,calcom_booking_id' },
        );

        if (upsertErr) {
          errors.push(`Booking ${booking.uid}: ${upsertErr.message}`);
        } else {
          synced++;
        }
      }
    }
  } catch (err) {
    errors.push(`Pull failed: ${err.message}`);
  }

  return { synced, errors };
}

/**
 * Full bidirectional sync:
 *   1. Pull Cal.com bookings → CRM (reconcile missed webhooks)
 *   2. Push unsynced CRM timed activities → Cal.com (create blocker bookings)
 *
 * @returns {{ pulled: number, pushed: number, errors: string[] }}
 */
export async function fullBidirectionalSync(tenantId) {
  const pullResult = await pullCalcomBookings(tenantId);
  const allErrors = [...pullResult.errors];
  let pushed = 0;

  const calcom = await getTenantCalcomConfig(tenantId);

  if (calcom?.eventTypeId) {
    const supabase = getSupabaseClient();
    // Look back 30 days for any timed activities that haven't been pushed yet
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

    const { data: activities, error: fetchErr } = await supabase
      .from('activities')
      .select('*')
      .eq('tenant_id', tenantId)
      .in('type', Array.from(SYNC_ACTIVITY_TYPES))
      .neq('status', 'cancelled')
      .gte('due_date', since)
      .not('due_time', 'is', null);

    if (fetchErr) {
      allErrors.push(`Activity fetch failed: ${fetchErr.message}`);
    } else {
      for (const activity of activities || []) {
        if (!activity.metadata?.calcom_block_uid) {
          try {
            await pushActivityToCalcom(tenantId, activity);
            pushed++;
          } catch (err) {
            allErrors.push(`Activity ${activity.id}: ${err.message}`);
          }
        }
      }
    }
  } else {
    logger.debug('[CalcomSync] fullBidirectionalSync: skipping CRM→Cal.com push (no event_type_id)', {
      tenantId,
    });
  }

  logger.info('[CalcomSync] Full sync complete', {
    tenantId,
    pulled: pullResult.synced,
    pushed,
    errors: allErrors.length,
  });

  return { pulled: pullResult.synced, pushed, errors: allErrors };
}
