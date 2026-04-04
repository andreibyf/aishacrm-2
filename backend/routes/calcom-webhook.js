/**
 * Cal.com Webhook Handler
 * POST /api/webhooks/calcom
 *
 * Handles incoming Cal.com booking lifecycle events:
 *   - BOOKING_CREATED   → decrement session credits, create activity, record booking
 *   - BOOKING_CANCELLED → refund credits if within policy, update booking status
 *   - BOOKING_RESCHEDULED → update booking times + linked activity, no credit change
 *   - BOOKING_REJECTED  → restore credits, update status
 *   - BOOKING_REQUESTED → record pending booking (no decrement until confirmed)
 *
 * Security: HMAC-SHA256 signature verified via X-Cal-Signature-256 header.
 * No authentication middleware — Cal.com is an external system.
 */

import express from 'express';
import crypto from 'crypto';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import {
  createGoogleEvent,
  updateGoogleEvent,
  deleteGoogleEvent,
} from '../lib/googleCalendarService.js';
import {
  createOutlookEvent,
  updateOutlookEvent,
  deleteOutlookEvent,
} from '../lib/outlookCalendarService.js';

const router = express.Router();

async function persistCalcomWebhookHealth(supabase, tenantId, updates) {
  if (!tenantId) return;

  const payload = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('tenant_integrations')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'calcom');

  if (error) {
    logger.warn('[CalcomWebhook] Failed to persist webhook health', {
      tenantId,
      error: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * Verify the Cal.com webhook signature.
 * Cal.com sends: X-Cal-Signature-256: sha256=<hex>
 * We compute HMAC-SHA256 over the raw body using the tenant's webhook_secret.
 */
function verifyCalcomSignature(rawBody, signatureHeader, secret) {
  if (!secret) return false;
  if (!signatureHeader) return false;

  const computedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  // Cal.com sends just the hex digest (no prefix). Normalise both sides so we
  // accept either format: "<hex>" or "sha256=<hex>".
  const normalise = (s) => (s.startsWith('sha256=') ? s.slice(7) : s);
  const incoming = normalise(signatureHeader);
  const expected = normalise(computedHex);

  try {
    return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Helper: resolve tenant by Cal.com webhook secret
// Cal.com is configured per-tenant via tenant_integrations.config.calcom
// ---------------------------------------------------------------------------

async function resolveTenantFromSignature(supabase, rawBody, signatureHeader) {
  const { data: integrations, error } = await supabase
    .from('tenant_integrations')
    .select('tenant_id, api_credentials')
    .eq('integration_type', 'calcom')
    .eq('is_active', true);

  if (error) {
    logger.error('[CalcomWebhook] Failed to fetch tenant integrations', error);
    return null;
  }

  for (const row of integrations || []) {
    const secret = row.api_credentials?.webhook_secret;
    if (secret && verifyCalcomSignature(rawBody, signatureHeader, secret)) {
      return { tenant_id: row.tenant_id, calcomConfig: row.api_credentials };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helper: find contact or lead by email within tenant
// ---------------------------------------------------------------------------

async function resolveEntityByEmail(supabase, tenant_id, email) {
  const normalised = email?.toLowerCase()?.trim();
  if (!normalised) return { contact_id: null, lead_id: null };

  const [{ data: contacts }, { data: leads }] = await Promise.all([
    supabase
      .from('contacts')
      .select('id')
      .eq('tenant_id', tenant_id)
      .ilike('email', normalised)
      .limit(1),
    supabase
      .from('leads')
      .select('id')
      .eq('tenant_id', tenant_id)
      .ilike('email', normalised)
      .limit(1),
  ]);

  return {
    contact_id: contacts?.[0]?.id || null,
    lead_id: leads?.[0]?.id || null,
  };
}

async function resolveAssignedEmployeeForBooking(
  supabase,
  tenant_id,
  { contact_id, lead_id, eventTypeId },
) {
  if (contact_id) {
    const { data } = await supabase
      .from('contacts')
      .select('assigned_to')
      .eq('tenant_id', tenant_id)
      .eq('id', contact_id)
      .maybeSingle();

    if (data?.assigned_to) return data.assigned_to;
  }

  if (lead_id) {
    const { data } = await supabase
      .from('leads')
      .select('assigned_to')
      .eq('tenant_id', tenant_id)
      .eq('id', lead_id)
      .maybeSingle();

    if (data?.assigned_to) return data.assigned_to;
  }

  if (eventTypeId) {
    // Filter in Postgres instead of loading all employees into memory
    const { data } = await supabase
      .from('employees')
      .select('id')
      .eq('tenant_id', tenant_id)
      .eq('metadata->>calcom_event_type_id', String(eventTypeId))
      .maybeSingle();

    if (data?.id) return data.id;
  }

  return null;
}

// ---------------------------------------------------------------------------
// Helper: find the best available active credit for an entity
// ---------------------------------------------------------------------------

async function findActiveCredit(supabase, tenant_id, contact_id, lead_id) {
  let query = supabase
    .from('session_credits')
    .select('id, credits_remaining, expiry_date')
    .eq('tenant_id', tenant_id)
    .gt('credits_remaining', 0)
    .gte('expiry_date', new Date().toISOString())
    .order('expiry_date', { ascending: true }) // use soonest-expiring first
    .limit(1);

  if (contact_id) {
    query = query.eq('contact_id', contact_id);
  } else if (lead_id) {
    query = query.eq('lead_id', lead_id);
  } else {
    return null;
  }

  const { data } = await query;
  return data?.[0] || null;
}

// ---------------------------------------------------------------------------
// Helper: create an activity record for the booking
// ---------------------------------------------------------------------------

async function createBookingActivity(
  supabase,
  { tenant_id, contact_id, lead_id, booking, attendeeName, attendeeEmail, assigned_to },
) {
  const { calcom_booking_id, calcom_event_type_id, scheduled_start, scheduled_end } = booking;

  const durationMinutes = Math.round((new Date(scheduled_end) - new Date(scheduled_start)) / 60000);
  const startLabel = new Date(scheduled_start).toLocaleString('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });

  // Activities table uses related_to/related_id pattern (not contact_id/lead_id direct columns)
  const related_to = lead_id ? 'lead' : contact_id ? 'contact' : null;
  const related_id = lead_id || contact_id || null;

  const { data, error } = await supabase
    .from('activities')
    .insert([
      {
        tenant_id,
        related_to,
        related_id,
        ...(attendeeName ? { related_name: attendeeName } : {}),
        ...(attendeeEmail ? { related_email: attendeeEmail } : {}),
        ...(assigned_to ? { assigned_to } : {}),
        type: 'booking_scheduled',
        subject: `Booking Scheduled - ${startLabel}`,
        body: `Cal.com session booked for ${startLabel} (${durationMinutes} min)`,
        due_date: scheduled_start?.split('T')[0],
        status: 'scheduled',
        metadata: {
          calcom_booking_id,
          calcom_event_type_id,
          duration_minutes: durationMinutes,
          credits_used: 1,
        },
      },
    ])
    .select('id')
    .single();

  if (error) {
    logger.error('[CalcomWebhook] Could not create activity', {
      error: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }
  return data?.id || null;
}

// ---------------------------------------------------------------------------
// Event handlers
// ---------------------------------------------------------------------------

async function handleBookingCreated(supabase, tenant_id, payload) {
  // Prefer CRM entity IDs embedded in the booking URL metadata — these are set by
  // BookingWidget and cannot be changed by the attendee, unlike the email field.
  // Fall back to email lookup for backwards compatibility (manual bookings, old links).
  let contact_id = payload.metadata?.crm_contact_id || null;
  let lead_id = payload.metadata?.crm_lead_id || null;
  const attendeeEmail = payload.attendees?.[0]?.email;

  if (!contact_id && !lead_id) {
    ({ contact_id, lead_id } = await resolveEntityByEmail(supabase, tenant_id, attendeeEmail));
  } else {
    logger.info('[CalcomWebhook] BOOKING_CREATED: resolved entity from metadata', {
      contact_id,
      lead_id,
    });
  }

  const credit = await findActiveCredit(supabase, tenant_id, contact_id, lead_id);
  if (!credit) {
    logger.warn('[CalcomWebhook] BOOKING_CREATED: no active credits found', {
      tenant_id,
      attendeeEmail,
    });
    // Still record the booking but without a credit link
  }

  // Decrement credits atomically
  if (credit) {
    const { error: creditErr } = await supabase
      .from('session_credits')
      .update({ credits_remaining: credit.credits_remaining - 1 })
      .eq('id', credit.id)
      .eq('credits_remaining', credit.credits_remaining); // optimistic lock

    if (creditErr) {
      logger.error('[CalcomWebhook] Failed to decrement credits', { error: creditErr.message });
    }
  }

  const bookingData = {
    calcom_booking_id: payload.uid,
    calcom_event_type_id: payload.eventTypeId || null,
    scheduled_start: payload.startTime,
    scheduled_end: payload.endTime,
  };

  const assigned_to = await resolveAssignedEmployeeForBooking(supabase, tenant_id, {
    contact_id,
    lead_id,
    eventTypeId: payload.eventTypeId || null,
  });

  // Create CRM activity
  const activity_id = await createBookingActivity(supabase, {
    tenant_id,
    contact_id,
    lead_id,
    booking: bookingData,
    attendeeName: payload.attendees?.[0]?.name,
    attendeeEmail,
    assigned_to,
  });

  // Record in booking_sessions
  const { error: insertErr } = await supabase.from('booking_sessions').upsert(
    [
      {
        tenant_id,
        credit_id: credit?.id || null,
        contact_id,
        lead_id,
        activity_id,
        status: 'confirmed',
        ...bookingData,
      },
    ],
    { onConflict: 'tenant_id,calcom_booking_id' },
  );

  if (insertErr) {
    logger.error('[CalcomWebhook] Failed to upsert booking_sessions', { error: insertErr.message });
  }

  // Fire-and-forget: sync the new booking activity to personal calendars (Google/Outlook)
  if (activity_id) {
    const calActivity = {
      id: activity_id,
      activity_type: 'booking_scheduled',
      subject: `Booking Scheduled`,
      activity_date: payload.startTime,
      scheduled_start: payload.startTime,
      end_time: payload.endTime,
      scheduled_end: payload.endTime,
      metadata: { calcom_booking_id: payload.uid },
    };
    createGoogleEvent(tenant_id, calActivity).catch(() => {});
    createOutlookEvent(tenant_id, calActivity).catch(() => {});
  }

  logger.info('[CalcomWebhook] BOOKING_CREATED processed', {
    tenant_id,
    uid: payload.uid,
    contact_id,
    lead_id,
    assigned_to,
    credit_id: credit?.id,
  });
}

async function handleBookingCancelled(supabase, tenant_id, payload, calcomConfig) {
  const { data: booking } = await supabase
    .from('booking_sessions')
    .select('id, credit_id, scheduled_start, status, activity_id')
    .eq('tenant_id', tenant_id)
    .eq('calcom_booking_id', payload.uid)
    .single();

  if (!booking) {
    logger.warn('[CalcomWebhook] BOOKING_CANCELLED: booking not found', { uid: payload.uid });
    return;
  }

  // Determine if credit refund applies
  // Policy: cancellations > 24h before start receive full credit refund (configurable)
  const cancellationPolicyHours = calcomConfig?.cancellation_policy_hours ?? 24;
  const hoursUntilStart = (new Date(booking.scheduled_start) - new Date()) / (1000 * 60 * 60);
  const isRefundEligible = hoursUntilStart > cancellationPolicyHours;

  if (isRefundEligible && booking.credit_id) {
    const { data: credit } = await supabase
      .from('session_credits')
      .select('credits_remaining, credits_purchased')
      .eq('id', booking.credit_id)
      .single();

    if (credit) {
      const newBalance = Math.min(credit.credits_remaining + 1, credit.credits_purchased);
      await supabase
        .from('session_credits')
        .update({ credits_remaining: newBalance })
        .eq('id', booking.credit_id);
      logger.info('[CalcomWebhook] Credit refunded', { credit_id: booking.credit_id, newBalance });
    }
  }

  // Update booking status
  await supabase
    .from('booking_sessions')
    .update({
      status: 'cancelled',
      cancellation_reason: payload.cancellationReason || null,
    })
    .eq('id', booking.id);

  // Mark linked activity as cancelled if present
  if (booking.activity_id) {
    const { data: activityData } = await supabase
      .from('activities')
      .update({ status: 'cancelled' })
      .eq('id', booking.activity_id)
      .eq('tenant_id', tenant_id)
      .select('id, metadata')
      .maybeSingle();

    // Fire-and-forget: remove from personal calendars
    if (activityData) {
      deleteGoogleEvent(tenant_id, activityData).catch(() => {});
      deleteOutlookEvent(tenant_id, activityData).catch(() => {});
    }
  }

  logger.info('[CalcomWebhook] BOOKING_CANCELLED processed', {
    uid: payload.uid,
    isRefundEligible,
  });
}

async function handleBookingRescheduled(supabase, tenant_id, payload) {
  // No credit change — update times only
  const updates = {
    scheduled_start: payload.startTime,
    scheduled_end: payload.endTime,
    status: 'confirmed',
  };

  await supabase
    .from('booking_sessions')
    .update(updates)
    .eq('tenant_id', tenant_id)
    .eq('calcom_booking_id', payload.uid);

  // Also update the linked activity date
  const { data: booking } = await supabase
    .from('booking_sessions')
    .select('activity_id')
    .eq('tenant_id', tenant_id)
    .eq('calcom_booking_id', payload.uid)
    .single();

  if (booking?.activity_id) {
    const { data: activityData } = await supabase
      .from('activities')
      .update({
        activity_date: payload.startTime,
        due_date: payload.startTime?.split('T')[0],
      })
      .eq('id', booking.activity_id)
      .eq('tenant_id', tenant_id)
      .select('id, activity_type, subject, metadata')
      .maybeSingle();

    // Fire-and-forget: update personal calendars with new time
    if (activityData) {
      const rescheduled = {
        ...activityData,
        activity_date: payload.startTime,
        scheduled_start: payload.startTime,
        end_time: payload.endTime,
        scheduled_end: payload.endTime,
      };
      updateGoogleEvent(tenant_id, rescheduled).catch(() => {});
      updateOutlookEvent(tenant_id, rescheduled).catch(() => {});
    }
  }

  logger.info('[CalcomWebhook] BOOKING_RESCHEDULED processed', { uid: payload.uid });
}

// ---------------------------------------------------------------------------
// Route
// ---------------------------------------------------------------------------

// Cal.com webhook — raw body needed for HMAC-SHA256 signature verification.
// express.json() stores the raw buffer on req.rawBody via the verify callback in initMiddleware.
// express.raw() is kept as a fallback if this route is hit before express.json() ran.
router.post('/calcom', express.raw({ type: 'application/json' }), async (req, res) => {
  // Prefer req.rawBody (set by express.json verify callback) over req.body (express.raw buffer)
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : null);
  const signatureHeader = req.headers['x-cal-signature-256'];

  if (!rawBody) {
    return res.status(400).json({ error: 'Unable to read request body' });
  }

  let parsed;
  try {
    parsed = JSON.parse(rawBody.toString('utf8'));
  } catch {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  const supabase = getSupabaseClient();

  // Resolve tenant by matching HMAC signature across all active Cal.com integrations
  const resolved = await resolveTenantFromSignature(supabase, rawBody, signatureHeader);
  if (!resolved) {
    logger.warn('[CalcomWebhook] Signature verification failed or no matching tenant');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { tenant_id, calcomConfig } = resolved;
  const { triggerEvent, payload } = parsed;

  logger.info('[CalcomWebhook] Received event', { triggerEvent, uid: payload?.uid, tenant_id });

  try {
    switch (triggerEvent) {
      case 'BOOKING_CREATED':
        await handleBookingCreated(supabase, tenant_id, payload);
        break;
      case 'BOOKING_CANCELLED':
      case 'BOOKING_REJECTED':
        await handleBookingCancelled(supabase, tenant_id, payload, calcomConfig);
        break;
      case 'BOOKING_RESCHEDULED':
        await handleBookingRescheduled(supabase, tenant_id, payload);
        break;
      case 'BOOKING_REQUESTED':
        // Approval-required flow — record as pending, no credit decrement yet
        logger.info('[CalcomWebhook] BOOKING_REQUESTED — awaiting confirmation', {
          uid: payload?.uid,
        });
        {
          const { error: upsertErr } = await supabase.from('booking_sessions').upsert(
            [
              {
                tenant_id,
                calcom_booking_id: payload.uid,
                calcom_event_type_id: payload.eventTypeId || null,
                scheduled_start: payload.startTime,
                scheduled_end: payload.endTime,
                status: 'pending',
              },
            ],
            { onConflict: 'tenant_id,calcom_booking_id' },
          );

          if (upsertErr) {
            throw new Error(`Could not persist pending booking: ${upsertErr.message}`);
          }
        }
        break;
      default:
        logger.debug('[CalcomWebhook] Unhandled event type', { triggerEvent });
    }

    await persistCalcomWebhookHealth(supabase, tenant_id, {
      sync_status: 'connected',
      error_message: null,
      last_sync: new Date().toISOString(),
    });

    res.status(200).json({ received: true });
  } catch (err) {
    logger.error('[CalcomWebhook] Unhandled error processing event', {
      triggerEvent,
      error: err.message,
    });

    await persistCalcomWebhookHealth(supabase, tenant_id, {
      sync_status: 'error',
      error_message: `${triggerEvent || 'UNKNOWN_EVENT'}: ${err.message}`,
    });

    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
