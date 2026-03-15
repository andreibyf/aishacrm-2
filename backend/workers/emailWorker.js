/**
 * Email Worker
 * Polls activities table for queued email activities and sends them through
 * tenant-scoped communications provider adapters.
 */

import dotenv from 'dotenv';
import { pool as pgPool, getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';
import { resolveCommunicationsProviderConnection } from '../lib/communications/providerConnectionResolver.js';

dotenv.config({ path: '.env.local' });
dotenv.config();

if (!pgPool) {
  logger.error('[EmailWorker] No database configured (ensure Supabase client is initialized)');
}

const POLL_INTERVAL_MS = parseInt(process.env.EMAIL_WORKER_POLL_MS || '5000', 10);
const BATCH_LIMIT = parseInt(process.env.EMAIL_WORKER_BATCH_LIMIT || '10', 10);
const MAX_ATTEMPTS = parseInt(process.env.EMAIL_MAX_ATTEMPTS || '5', 10);
const BACKOFF_BASE_MS = parseInt(process.env.EMAIL_BACKOFF_BASE_MS || '10000', 10);
const BACKOFF_FACTOR = parseFloat(process.env.EMAIL_BACKOFF_FACTOR || '2');
const BACKOFF_JITTER_MS = parseInt(process.env.EMAIL_BACKOFF_JITTER_MS || '2000', 10);
const STATUS_WEBHOOK = process.env.EMAIL_STATUS_WEBHOOK_URL;
const ICS_PROD_ID =
  process.env.COMMUNICATIONS_ICS_PROD_ID || '-//AiSHA CRM//Communications Module//EN';

function parseEmailMeta(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return meta.email && typeof meta.email === 'object' ? meta.email : {};
}

function parseCommunicationsMeta(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return meta.communications && typeof meta.communications === 'object' ? meta.communications : {};
}

function parseMeetingMeta(metadata) {
  const meta = metadata && typeof metadata === 'object' ? metadata : {};
  return meta.meeting && typeof meta.meeting === 'object' ? meta.meeting : {};
}

function getActivityDescription(activity, email) {
  return activity.body || email.body || '';
}

function normalizeAttendee(entry) {
  if (!entry) return null;
  if (typeof entry === 'string') {
    const trimmed = entry.trim();
    return trimmed ? { email: trimmed, name: null } : null;
  }
  if (typeof entry === 'object') {
    const email = typeof entry.email === 'string' ? entry.email.trim() : '';
    if (!email) return null;
    return {
      email,
      name: typeof entry.name === 'string' && entry.name.trim() ? entry.name.trim() : null,
    };
  }
  return null;
}

function collectMeetingAttendees(activity, email, meeting) {
  const candidates = Array.isArray(meeting.attendees)
    ? meeting.attendees
    : Array.isArray(activity.metadata?.attendees)
      ? activity.metadata.attendees
      : Array.isArray(email.to)
        ? email.to
        : typeof email.to === 'string'
          ? email.to.split(',').map((value) => value.trim())
          : activity.related_email
            ? [activity.related_email]
            : [];

  const attendees = [];
  const seen = new Set();
  for (const candidate of candidates) {
    const normalized = normalizeAttendee(candidate);
    if (!normalized?.email) continue;
    const key = normalized.email.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    attendees.push(normalized);
  }
  return attendees;
}

function formatIcsDate(date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${date.getUTCDate()}`.padStart(2, '0');
  const hours = `${date.getUTCHours()}`.padStart(2, '0');
  const minutes = `${date.getUTCMinutes()}`.padStart(2, '0');
  const seconds = `${date.getUTCSeconds()}`.padStart(2, '0');
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeIcsText(value) {
  return String(value || '')
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;');
}

function combineActivityDateTime(activity) {
  if (!activity?.due_date) return null;
  const dueTime =
    typeof activity.due_time === 'string' && activity.due_time.trim()
      ? activity.due_time.trim()
      : '00:00';
  const candidate = new Date(`${activity.due_date}T${dueTime}:00Z`);
  return Number.isNaN(candidate.getTime()) ? null : candidate;
}

function buildMeetingInviteArtifacts(activity, email, meeting, organizerEmail) {
  const startAt = combineActivityDateTime(activity);
  if (!startAt) {
    throw new Error('Meeting invite requires due_date and due_time on the meeting activity');
  }

  const durationMinutes = Number.isFinite(Number(activity.duration_minutes))
    ? Number(activity.duration_minutes)
    : Number.isFinite(Number(meeting.duration_minutes))
      ? Number(meeting.duration_minutes)
      : 30;
  const endAt = new Date(startAt.getTime() + durationMinutes * 60 * 1000);
  const attendees = collectMeetingAttendees(activity, email, meeting);
  if (attendees.length === 0) {
    throw new Error('Meeting invite requires at least one attendee email');
  }

  const inviteUid =
    meeting.invite_uid || meeting.invite_id || `meeting-${activity.id}@aishacrm.local`;
  const now = new Date();
  const description = getActivityDescription(activity, email);
  const summary = email.subject || activity.subject || 'Meeting Invitation';
  const organizer = organizerEmail || email.from || 'no-reply@aishacrm.local';
  const location = meeting.location || activity.location || '';
  const status = String(meeting.status || 'CONFIRMED').toUpperCase();

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${ICS_PROD_ID}`,
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(inviteUid)}`,
    `DTSTAMP:${formatIcsDate(now)}`,
    `DTSTART:${formatIcsDate(startAt)}`,
    `DTEND:${formatIcsDate(endAt)}`,
    `SUMMARY:${escapeIcsText(summary)}`,
    `DESCRIPTION:${escapeIcsText(description)}`,
    `STATUS:${escapeIcsText(status)}`,
    `ORGANIZER:mailto:${escapeIcsText(organizer)}`,
  ];

  if (location) {
    lines.push(`LOCATION:${escapeIcsText(location)}`);
  }

  for (const attendee of attendees) {
    const params = ['ROLE=REQ-PARTICIPANT', 'RSVP=TRUE'];
    if (attendee.name) {
      params.push(`CN=${escapeIcsText(attendee.name)}`);
    }
    lines.push(`ATTENDEE;${params.join(';')}:mailto:${escapeIcsText(attendee.email)}`);
  }

  lines.push('END:VEVENT', 'END:VCALENDAR');

  return {
    inviteUid,
    attendees,
    attachment: {
      filename: 'invite.ics',
      content: lines.join('\r\n'),
      contentType: 'text/calendar; method=REQUEST; charset=UTF-8',
    },
  };
}

async function fetchQueuedEmails() {
  const supabase = getSupabaseClient();
  const now = new Date().toISOString();

  const { data: emailActivities, error: emailError } = await supabase
    .from('activities')
    .select('*')
    .eq('type', 'email')
    .eq('status', 'queued')
    .or(
      `metadata->delivery->next_attempt_at.is.null,metadata->delivery->>next_attempt_at.lte.${now}`,
    )
    .order('created_date', { ascending: true })
    .limit(BATCH_LIMIT);

  if (emailError) {
    logger.error('[fetchQueuedEmails] Error fetching queued emails:', {
      message: emailError.message,
      code: emailError.code,
      details: emailError.details,
      hint: emailError.hint,
      fullError: emailError,
    });
    return [];
  }

  const { data: meetingActivities, error: meetingError } = await supabase
    .from('activities')
    .select('*')
    .eq('type', 'meeting')
    .eq('status', 'scheduled')
    .eq('metadata->meeting->>send_invite', 'true')
    .is('metadata->meeting->>invite_sent_at', null)
    .order('created_date', { ascending: true })
    .limit(BATCH_LIMIT);

  if (meetingError) {
    logger.error('[fetchQueuedEmails] Error fetching pending meeting invites:', {
      message: meetingError.message,
      code: meetingError.code,
      details: meetingError.details,
      hint: meetingError.hint,
      fullError: meetingError,
    });
  }

  return [...(emailActivities || []), ...(meetingActivities || []).slice(0, BATCH_LIMIT)].slice(
    0,
    BATCH_LIMIT,
  );
}

async function markActivity(activityId, status, newMeta) {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from('activities')
    .update({
      status,
      metadata: newMeta || {},
    })
    .eq('id', activityId)
    .select();

  if (error) {
    logger.error(
      `[markActivity] Failed to update activity ${activityId} to status '${status}':`,
      error.message,
    );
    throw error;
  }
}

async function postStatusWebhook(payload) {
  if (!STATUS_WEBHOOK) return;

  try {
    await fetch(STATUS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch (error) {
    logger.warn('[EmailWorker] Status webhook failed:', error?.message);
  }
}

async function createNotification({ tenant_id, title, message, type = 'info', user_email = null }) {
  try {
    await pgPool.query(
      `INSERT INTO notifications (tenant_id, user_email, title, message, type, is_read, created_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [tenant_id, user_email, title, message, type, false],
    );
  } catch (error) {
    logger.warn('[EmailWorker] Failed to create notification:', error?.message);
  }
}

function computeNextAttempt(attempts) {
  const delay = BACKOFF_BASE_MS * Math.pow(BACKOFF_FACTOR, Math.max(0, attempts - 1));
  const jitter = Math.floor(Math.random() * BACKOFF_JITTER_MS);
  return new Date(Date.now() + delay + jitter).toISOString();
}

const emailWorkerDeps = {
  resolveProviderConnection: resolveCommunicationsProviderConnection,
  markActivity,
  createNotification,
  postStatusWebhook,
};

export async function processActivity(activity) {
  const meta = activity.metadata && typeof activity.metadata === 'object' ? activity.metadata : {};
  const email = parseEmailMeta(meta);
  const communications = parseCommunicationsMeta(meta);
  const meeting = parseMeetingMeta(meta);
  const isMeetingInvite = activity.type === 'meeting';

  logger.info(
    `[EmailWorker] Processing email activity ${activity.id} with tenant_id: ${activity.tenant_id}`,
  );

  const toValue = email.to || (isMeetingInvite ? undefined : activity.subject);
  const subject = email.subject || activity.subject || 'Notification';
  const body = getActivityDescription(activity, email);

  if (!toValue && !isMeetingInvite) {
    const failedMeta = {
      ...meta,
      delivery: {
        error: 'Missing recipient',
        failed_at: new Date().toISOString(),
      },
    };
    await emailWorkerDeps.markActivity(activity.id, 'failed', failedMeta);
    logger.warn('[EmailWorker] Skipping email activity due to missing recipient', activity.id);
    return;
  }

  const mailboxId = communications.mailbox_id || meta.mailbox_id || email.mailbox_id || null;
  const mailboxAddress =
    communications.mailbox_address || meta.mailbox_address || email.from || null;

  const providerConnection = await emailWorkerDeps.resolveProviderConnection({
    tenantId: activity.tenant_id,
    mailboxId,
    mailboxAddress,
  });

  if (!providerConnection) {
    const failedMeta = {
      ...meta,
      delivery: {
        ...(meta.delivery || {}),
        provider: 'communications_provider',
        error:
          'No communications provider mailbox is configured for this outbound email. Please configure a communications provider mailbox in Settings > Tenant Integrations.',
        failed_at: new Date().toISOString(),
      },
    };

    await emailWorkerDeps.markActivity(activity.id, 'failed', failedMeta);
    await emailWorkerDeps.createNotification({
      tenant_id: activity.tenant_id,
      title: 'Email delivery failed - No communications provider configured',
      message:
        'Email could not be sent. Please configure a communications provider mailbox in Settings > Tenant Integrations.',
      type: 'error',
    });
    return;
  }

  const providerType = providerConnection.connection?.config?.provider_type || 'unknown';
  const providerName = providerConnection.connection?.config?.provider_name || 'unknown';
  const from = email.from || providerConnection.connection?.config?.outbound?.from_address;
  let toList = Array.isArray(toValue)
    ? toValue
    : toValue
      ? String(toValue)
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean)
      : [];
  let inviteArtifacts = null;

  try {
    if (isMeetingInvite) {
      inviteArtifacts = buildMeetingInviteArtifacts(activity, email, meeting, from);
      toList = inviteArtifacts.attendees.map((entry) => entry.email);
    }

    const result = await providerConnection.adapter.sendMessage({
      from,
      to: toList,
      cc: email.cc || undefined,
      bcc: email.bcc || undefined,
      reply_to: email.reply_to || communications.reply_to_address || undefined,
      subject,
      text_body: body,
      html_body: email.html_body || (/<\w+/.test(body) ? body : undefined),
      headers: {
        ...(email.headers || {}),
        ...(isMeetingInvite ? { 'Content-Class': 'urn:content-classes:calendarmessage' } : {}),
      },
      attachments: inviteArtifacts ? [inviteArtifacts.attachment] : undefined,
    });

    const sentMeta = {
      ...meta,
      delivery: {
        ...(meta.delivery || {}),
        provider: providerType,
        provider_name: providerName,
        provider_integration_id: providerConnection.integration?.id || null,
        mailbox_id: providerConnection.connection?.config?.mailbox_id || mailboxId,
        messageId: result?.message_id || null,
        sent_at: new Date().toISOString(),
        attempts: ((meta.delivery && meta.delivery.attempts) || 0) + 1,
      },
      ...(isMeetingInvite
        ? {
            meeting: {
              ...meeting,
              send_invite: true,
              invite_id: meeting.invite_id || inviteArtifacts?.inviteUid || null,
              invite_uid: inviteArtifacts?.inviteUid || meeting.invite_uid || null,
              invite_sent_at: new Date().toISOString(),
              invite_status: 'sent',
              attendees:
                inviteArtifacts?.attendees || collectMeetingAttendees(activity, email, meeting),
            },
          }
        : {}),
    };

    await emailWorkerDeps.markActivity(
      activity.id,
      isMeetingInvite ? activity.status || 'scheduled' : 'sent',
      sentMeta,
    );
    await emailWorkerDeps.postStatusWebhook({
      event: isMeetingInvite ? 'meeting.invite.sent' : 'email.sent',
      activity_id: activity.id,
      tenant_id: activity.tenant_id,
      to: toList,
      subject,
      messageId: result?.message_id || null,
      provider_type: providerType,
      provider_name: providerName,
      invite_uid: inviteArtifacts?.inviteUid || null,
    });
  } catch (error) {
    const prevAttempts =
      meta.delivery && meta.delivery.attempts ? parseInt(meta.delivery.attempts, 10) : 0;
    const attempts = prevAttempts + 1;
    const delivery = {
      ...(meta.delivery || {}),
      provider: providerType,
      provider_name: providerName,
      error: error?.message || 'Provider send failed',
      last_error_at: new Date().toISOString(),
      attempts,
    };
    const failureMeta = {
      ...meta,
      delivery,
      ...(isMeetingInvite
        ? {
            meeting: {
              ...meeting,
              send_invite: true,
              invite_status: 'failed',
              invite_failed_at: new Date().toISOString(),
            },
          }
        : {}),
    };

    if (attempts < MAX_ATTEMPTS) {
      delivery.next_attempt_at = computeNextAttempt(attempts);
      await emailWorkerDeps.markActivity(
        activity.id,
        isMeetingInvite ? activity.status || 'scheduled' : 'queued',
        failureMeta,
      );
      await emailWorkerDeps.postStatusWebhook({
        event: isMeetingInvite ? 'meeting.invite.retry_scheduled' : 'email.retry_scheduled',
        activity_id: activity.id,
        tenant_id: activity.tenant_id,
        attempts,
        next_attempt_at: delivery.next_attempt_at,
        error: error?.message || 'Provider send failed',
        provider_type: providerType,
        provider_name: providerName,
      });
      return;
    }

    await emailWorkerDeps.markActivity(activity.id, 'failed', {
      ...failureMeta,
      delivery: {
        ...delivery,
        failed_at: new Date().toISOString(),
      },
    });
    await emailWorkerDeps.postStatusWebhook({
      event: isMeetingInvite ? 'meeting.invite.failed' : 'email.failed',
      activity_id: activity.id,
      tenant_id: activity.tenant_id,
      attempts,
      error: error?.message || 'Provider send failed',
      provider_type: providerType,
      provider_name: providerName,
    });
    await emailWorkerDeps.createNotification({
      tenant_id: activity.tenant_id,
      title: isMeetingInvite ? 'Meeting invite delivery failed' : 'Email delivery failed',
      message: `Could not deliver ${isMeetingInvite ? 'meeting invite' : 'email'} to ${toList.join(', ')} after ${attempts} attempts. Subject: ${subject}`,
      type: 'error',
    });
  }
}

async function loop() {
  if (!pgPool) return;

  try {
    const rows = await fetchQueuedEmails();
    for (const row of rows) {
      await processActivity(row);
    }
  } catch (error) {
    logger.error('[EmailWorker] Loop error:', error.message);
  } finally {
    setTimeout(loop, POLL_INTERVAL_MS);
  }
}

let workerStarted = false;

export function startEmailWorker(pool) {
  if (workerStarted) {
    logger.warn('[EmailWorker] Worker already started - ignoring duplicate init');
    return {
      stop: () => {
        logger.debug('[EmailWorker] Stop called on already-running worker');
      },
    };
  }

  workerStarted = true;

  if (pool) {
    Object.assign(pgPool, pool);
  }

  logger.info('[EmailWorker] Starting email worker (provider-backed)...');
  logger.info(`[EmailWorker] Poll interval: ${POLL_INTERVAL_MS}ms, Batch limit: ${BATCH_LIMIT}`);
  loop();

  return {
    stop: () => {
      logger.info('[EmailWorker] Stopping email worker...');
      workerStarted = false;
    },
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startEmailWorker();

  process.on('SIGTERM', async () => {
    try {
      if (pgPool) {
        await pgPool.end();
      }
    } catch (error) {
      logger.warn('[EmailWorker] Error during pool shutdown:', error?.message);
    }
    process.exit(0);
  });
}

export function setEmailWorkerDependenciesForTests(overrides = {}) {
  if (overrides === null) {
    emailWorkerDeps.resolveProviderConnection = resolveCommunicationsProviderConnection;
    emailWorkerDeps.markActivity = markActivity;
    emailWorkerDeps.createNotification = createNotification;
    emailWorkerDeps.postStatusWebhook = postStatusWebhook;
    return;
  }

  if (overrides.resolveProviderConnection) {
    emailWorkerDeps.resolveProviderConnection = overrides.resolveProviderConnection;
  }
  if (overrides.markActivity) {
    emailWorkerDeps.markActivity = overrides.markActivity;
  }
  if (overrides.createNotification) {
    emailWorkerDeps.createNotification = overrides.createNotification;
  }
  if (overrides.postStatusWebhook) {
    emailWorkerDeps.postStatusWebhook = overrides.postStatusWebhook;
  }
}

export default {
  startEmailWorker,
  processActivity,
  setEmailWorkerDependenciesForTests,
};
