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
 * Architecture:
 *
 *   Personal Calendar (Google/Outlook) ←→ AiSHA CRM ←→ Cal.com
 *
 *   AiSHA CRM is the single hub. Both sides talk only to AiSHA CRM:
 *     - Tenants connect Google/Outlook directly to AiSHA (via tenant_integrations OAuth).
 *     - Cal.com communicates with AiSHA only via webhooks + API.
 *
 *   All events — regardless of origin — flow through AiSHA CRM activities.
 *   The single pushActivityToCalcom() hook handles propagation to Cal.com for all of them:
 *
 *   Client books via Cal.com:
 *     Cal.com → webhook → AiSHA CRM activity created → pushActivityToCalcom() skips
 *     (already exists in Cal.com) → Google/Outlook API: write event  [IMPLEMENTED]
 *
 *   Organizer creates CRM activity (manual or from personal calendar import):
 *     AiSHA CRM activity created → pushActivityToCalcom() → Cal.com blocker  [IMPLEMENTED]
 *                                 → Google/Outlook API: write event           [IMPLEMENTED]
 *
 *   Personal calendar event imported into AiSHA CRM:
 *     Google/Outlook API → AiSHA CRM activity created → pushActivityToCalcom() → Cal.com blocker
 *     No separate path needed — same activity hook handles it automatically.
 *
 *   Personal calendar write/delete/update is handled by:
 *     backend/lib/googleCalendarService.js  — Google Calendar API v3
 *     backend/lib/outlookCalendarService.js — Microsoft Graph API
 *   Hooked from activities.v2.js (POST/PUT/DELETE) and calcom-webhook.js (all booking events).
 *   Import endpoint: GET /api/calcom-sync/import-personal-calendar
 *
 * Requirements:
 *   - Tenant has an active Cal.com integration in tenant_integrations
 *   - api_credentials.api_key  — Cal.com API key (required)
 *   - config.event_type_id     — Event Type ID for blocker bookings (required for CRM→Cal.com)
 *   - config.base_url          — Cal.com base URL (optional, default: https://app.cal.com)
 */

import { randomUUID } from 'crypto';
import logger from './logger.js';
import { getSupabaseClient } from './supabase-db.js';
import { getCalcomDb } from './calcomDb.js';

// Activity types that represent time-blocked events and should sync to Cal.com
const SYNC_ACTIVITY_TYPES = new Set([
  'meeting',
  'call',
  'appointment',
  'booking_scheduled',
  'demo',
  'consultation',
]);

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Fetch the tenant's active Cal.com integration config from the DB.
 * Returns null if not configured or if calcom-db is unavailable.
 *
 * Expected tenant_integrations.config shape:
 *   {
 *     event_type_id: <number>,   // Cal.com EventType id for blocker bookings
 *     calcom_user_id: <number>,  // Cal.com users.id for this tenant
 *   }
 */
async function getTenantCalcomConfig(tenantId) {
  const db = getCalcomDb();
  if (!db) return null; // Cal.com DB not configured

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from('tenant_integrations')
    .select('config')
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'calcom')
    .eq('is_active', true)
    .maybeSingle();

  if (error || !data) return null;

  const calcomUserId = data.config?.calcom_user_id || null;
  const eventTypeId = data.config?.event_type_id || null;

  return {
    calcomUserId,
    eventTypeId,
    config: data.config,
  };
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

  const db = getCalcomDb();
  if (!db) return;

  try {
    const calcom = await getTenantCalcomConfig(tenantId);
    if (!calcom) return;

    if (!calcom.eventTypeId || !calcom.calcomUserId) {
      logger.debug('[CalcomSync] Missing event_type_id or calcom_user_id — skipping push', {
        tenantId,
        activityId: activity.id,
      });
      return;
    }

    // Build start/end timestamps (CRM stores due_date as YYYY-MM-DD, due_time as HH:MM in UTC)
    const start = new Date(`${activity.due_date}T${activity.due_time}:00.000Z`);
    const durationMin = activity.duration_minutes || 60;
    const end = new Date(start.getTime() + durationMin * 60 * 1000);

    const existingBlockUid = activity.metadata?.calcom_block_uid;

    if (existingBlockUid) {
      // Reschedule: update startTime/endTime on the existing blocker booking
      const result = await db.query(
        `UPDATE "Booking" SET "startTime" = $1, "endTime" = $2, "updatedAt" = NOW()
         WHERE uid = $3 AND "userId" = $4`,
        [start, end, existingBlockUid, calcom.calcomUserId],
      );
      if (result.rowCount > 0) {
        logger.debug('[CalcomSync] Rescheduled Cal.com block', { uid: existingBlockUid });
      } else {
        logger.warn('[CalcomSync] Reschedule found no matching booking', { uid: existingBlockUid });
      }
      return;
    }

    // Create a new Cal.com blocker booking
    const blockerEmail = activity.related_email || `crm-block-${tenantId}@internal.aisha`;
    const blockerName = activity.subject || 'CRM Activity';
    const uid = randomUUID();
    const bookingMeta = JSON.stringify({ crm_activity_id: activity.id, crm_tenant_id: tenantId });

    const { rows } = await db.query(
      `INSERT INTO "Booking" (uid, "userId", "eventTypeId", title, "startTime", "endTime",
         status, metadata, "createdAt", "updatedAt")
       VALUES ($1, $2, $3, $4, $5, $6, 'accepted'::"BookingStatus", $7::jsonb, NOW(), NOW())
       RETURNING id`,
      [uid, calcom.calcomUserId, calcom.eventTypeId, blockerName, start, end, bookingMeta],
    );

    const bookingId = rows[0]?.id;
    if (!bookingId) {
      logger.warn('[CalcomSync] Booking INSERT returned no id', { activityId: activity.id });
      return;
    }

    // Insert the required attendee row
    await db.query(
      `INSERT INTO "Attendee" (email, name, "timeZone", locale, "bookingId")
       VALUES ($1, $2, 'UTC', 'en', $3)`,
      [blockerEmail, blockerName, bookingId],
    );

    // Persist the Cal.com booking UID back into the CRM activity metadata
    const supabase = getSupabaseClient();
    const updatedMeta = { ...(activity.metadata || {}), calcom_block_uid: uid };
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
      logger.info('[CalcomSync] Created Cal.com block booking', { uid, activityId: activity.id });
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

  const db = getCalcomDb();
  if (!db) return;

  try {
    const result = await db.query(
      `UPDATE "Booking" SET status = 'cancelled'::"BookingStatus",
         "cancellationReason" = 'CRM activity removed', "updatedAt" = NOW()
       WHERE uid = $1`,
      [blockUid],
    );
    if (result.rowCount > 0) {
      logger.info('[CalcomSync] Cancelled Cal.com block booking', { uid: blockUid });
    } else {
      logger.warn('[CalcomSync] Cancel found no matching booking', { uid: blockUid });
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
  const db = getCalcomDb();
  if (!db) return { synced: 0, errors: ['Cal.com DB not configured'] };

  const calcom = await getTenantCalcomConfig(tenantId);
  if (!calcom) return { synced: 0, errors: ['Cal.com integration not configured'] };
  if (!calcom.calcomUserId) return { synced: 0, errors: ['calcom_user_id not set in config'] };

  const errors = [];
  let synced = 0;

  try {
    // Pull upcoming accepted bookings for this tenant's Cal.com user,
    // excluding blockers we created ourselves (they carry crm_activity_id in metadata).
    const { rows: bookings } = await db.query(
      `SELECT uid, "eventTypeId", "startTime", "endTime", status, metadata
         FROM "Booking"
        WHERE "userId" = $1
          AND status = 'accepted'
          AND "startTime" > NOW()
          AND (metadata IS NULL OR metadata->>'crm_activity_id' IS NULL)
        ORDER BY "startTime"
        LIMIT 100`,
      [calcom.calcomUserId],
    );

    const supabase = getSupabaseClient();

    for (const booking of bookings) {
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
    logger.debug(
      '[CalcomSync] fullBidirectionalSync: skipping CRM→Cal.com push (no event_type_id)',
      {
        tenantId,
      },
    );
  }

  logger.info('[CalcomSync] Full sync complete', {
    tenantId,
    pulled: pullResult.synced,
    pushed,
    errors: allErrors.length,
  });

  return { pulled: pullResult.synced, pushed, errors: allErrors };
}
