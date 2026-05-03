/**
 * DocuSeal Webhook Handler
 * POST /api/webhooks/docuseal
 *
 * Handles incoming DocuSeal submission lifecycle events:
 *   - form.viewed         → status='viewed', activity 'document_viewed'
 *   - form.completed      → status='signed' (per-recipient), activity 'document_signed'
 *   - submission.completed → status='completed' (all signed), activity 'document_completed', stores signed_document_url
 *   - submission.declined  → status='declined', activity 'document_declined'
 *   - submission.expired   → status='expired', activity 'document_expired'
 *
 * Security: HMAC-SHA256 over raw body via X-Docuseal-Signature header,
 *           verified against each tenant's webhook_secret in tenant_integrations
 *           (integration_type='docuseal', is_active=true). Identical pattern
 *           to calcom-webhook.js.
 *
 * No authentication middleware — DocuSeal is an external system.
 *
 * Idempotency: docuseal_submissions.last_event_id stores the last processed
 *              event id; replays short-circuit before mutation. Status
 *              transitions are guarded so 'completed' won't regress to 'viewed'.
 */

import express from 'express';
import crypto from 'crypto';
import { getSupabaseClient } from '../lib/supabase-db.js';
import logger from '../lib/logger.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Webhook health tracking on tenant_integrations
// ---------------------------------------------------------------------------

async function persistDocusealWebhookHealth(supabase, tenantId, updates) {
  if (!tenantId) return;
  const payload = { ...updates, updated_at: new Date().toISOString() };
  const { error } = await supabase
    .from('tenant_integrations')
    .update(payload)
    .eq('tenant_id', tenantId)
    .eq('integration_type', 'docuseal');
  if (error) {
    logger.warn('[DocusealWebhook] Failed to persist webhook health', {
      tenantId,
      error: error.message,
    });
  }
}

// ---------------------------------------------------------------------------
// Signature verification
// ---------------------------------------------------------------------------

/**
 * DocuSeal sends X-Docuseal-Signature: sha256=<hex> (or just <hex>).
 * Compute HMAC-SHA256 over raw body using the tenant's webhook_secret.
 */
function verifyDocusealSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;
  const computedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const normalise = (s) => (s.startsWith('sha256=') ? s.slice(7) : s);
  const incoming = normalise(signatureHeader);
  const expected = normalise(computedHex);
  try {
    return crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(expected));
  } catch {
    return false;
  }
}

async function resolveTenantFromSignature(supabase, rawBody, signatureHeader) {
  const { data: integrations, error } = await supabase
    .from('tenant_integrations')
    .select('tenant_id, api_credentials')
    .eq('integration_type', 'docuseal')
    .eq('is_active', true);

  if (error) {
    logger.error('[DocusealWebhook] Failed to fetch tenant integrations', error);
    return null;
  }

  for (const row of integrations || []) {
    const secret = row.api_credentials?.webhook_secret;
    if (secret && verifyDocusealSignature(rawBody, signatureHeader, secret)) {
      return { tenant_id: row.tenant_id, integration: row.api_credentials };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Status transition guard — prevent regressions (e.g., completed → viewed)
// ---------------------------------------------------------------------------

const STATUS_RANK = {
  pending: 0,
  sent: 1,
  viewed: 2,
  signed: 3,
  completed: 4,
  declined: 4,
  expired: 4,
  failed: 4,
};

function canTransition(currentStatus, newStatus) {
  const cur = STATUS_RANK[currentStatus] ?? 0;
  const next = STATUS_RANK[newStatus] ?? 0;
  return next >= cur;
}

// ---------------------------------------------------------------------------
// Activity creation helper
// ---------------------------------------------------------------------------

async function createActivity(supabase, tenantId, submission, activityType, body) {
  // Skip viewed dedupe: don't create duplicate 'document_viewed' within 1h
  if (activityType === 'document_viewed') {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const { data: recent } = await supabase
      .from('activities')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('type', 'document_viewed')
      .gte('created_at', oneHourAgo)
      .filter('metadata->>docuseal_submission_id', 'eq', submission.docuseal_submission_id)
      .limit(1);
    if (recent && recent.length > 0) {
      return; // already logged a viewed event recently
    }
  }

  const subject = `Document ${activityType.replace('document_', '')} — ${submission.template_name || 'unnamed template'}`;
  await supabase.from('activities').insert({
    tenant_id: tenantId,
    related_to: submission.related_to,
    related_id: submission.related_id,
    type: activityType,
    subject,
    body,
    status: 'completed',
    metadata: {
      docuseal_submission_id: submission.docuseal_submission_id,
      docuseal_template_id: submission.docuseal_template_id,
      signed_document_url: submission.signed_document_url,
    },
  });
}

// ---------------------------------------------------------------------------
// Event dispatcher — maps DocuSeal event types to status + activity
// ---------------------------------------------------------------------------

const EVENT_MAP = {
  'form.viewed':           { status: 'viewed',    activity: 'document_viewed',    timestampField: 'viewed_at' },
  'form.completed':        { status: 'signed',    activity: 'document_signed',    timestampField: null },
  'submission.completed':  { status: 'completed', activity: 'document_completed', timestampField: 'completed_at' },
  'submission.declined':   { status: 'declined',  activity: 'document_declined',  timestampField: null },
  'submission.expired':    { status: 'expired',   activity: 'document_expired',   timestampField: null },
};

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

router.post('/docuseal', async (req, res) => {
  const supabase = getSupabaseClient();
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
  const signatureHeader = req.headers['x-docuseal-signature'] || req.headers['X-Docuseal-Signature'];

  // 1. Verify signature, resolve tenant
  const matched = await resolveTenantFromSignature(supabase, rawBody, signatureHeader);
  if (!matched) {
    logger.warn('[DocusealWebhook] Signature verification failed; no tenant matched');
    return res.status(401).json({ error: 'invalid_signature' });
  }
  const { tenant_id } = matched;

  // 2. Parse payload
  let payload;
  try {
    payload = typeof req.body === 'object' && !Buffer.isBuffer(req.body)
      ? req.body
      : JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    logger.error('[DocusealWebhook] Failed to parse JSON body', err);
    return res.status(400).json({ error: 'invalid_json' });
  }

  // DocuSeal payload shape (per docs): { event_type, timestamp, data: { id, ... } }
  // The id under `data` is the submission id; submitter/template info is nested.
  const eventType = payload.event_type || payload.type;
  const eventTimestamp = payload.timestamp || payload.event_timestamp || new Date().toISOString();
  const eventId = payload.event_id || `${eventType}:${eventTimestamp}`;
  const data = payload.data || {};
  const docusealSubmissionId = String(data.submission_id || data.id || '');

  if (!eventType || !docusealSubmissionId) {
    logger.warn('[DocusealWebhook] Missing event_type or submission id', { eventType, docusealSubmissionId });
    return res.status(200).json({ ok: true, ignored: 'missing_fields' });
  }

  // 3. Look up our submission row
  const { data: submission, error: lookupError } = await supabase
    .from('docuseal_submissions')
    .select('*')
    .eq('tenant_id', tenant_id)
    .eq('docuseal_submission_id', docusealSubmissionId)
    .maybeSingle();

  if (lookupError) {
    logger.error('[DocusealWebhook] Submission lookup failed', lookupError);
    return res.status(500).json({ error: 'lookup_failed' });
  }

  if (!submission) {
    // Race: send-route INSERT may not have committed yet, OR this is an event
    // for a submission we don't track. Log and return 200 — DocuSeal will not
    // retry for non-error responses.
    logger.info('[DocusealWebhook] Unknown submission id; ignoring', { tenant_id, docusealSubmissionId, eventType });
    return res.status(200).json({ ok: true, ignored: 'unknown_submission' });
  }

  // 4. Idempotency check
  if (submission.last_event_id && submission.last_event_id === eventId) {
    return res.status(200).json({ ok: true, idempotent: true });
  }

  // 5. Map event -> status + activity
  const mapping = EVENT_MAP[eventType];
  if (!mapping) {
    logger.debug('[DocusealWebhook] Unhandled event type', { eventType });
    // Update last_event_id so we don't reprocess on replay
    await supabase
      .from('docuseal_submissions')
      .update({ last_event_id: eventId, last_event_at: eventTimestamp })
      .eq('id', submission.id);
    return res.status(200).json({ ok: true, ignored: 'unhandled_event' });
  }

  // 6. Status transition guard
  if (!canTransition(submission.status, mapping.status)) {
    logger.info('[DocusealWebhook] Status regression rejected', {
      from: submission.status,
      to: mapping.status,
      submissionId: submission.id,
    });
    await supabase
      .from('docuseal_submissions')
      .update({ last_event_id: eventId, last_event_at: eventTimestamp })
      .eq('id', submission.id);
    return res.status(200).json({ ok: true, ignored: 'status_regression' });
  }

  // 7. Build update payload
  const update = {
    status: mapping.status,
    last_event_id: eventId,
    last_event_at: eventTimestamp,
  };
  if (mapping.timestampField) {
    update[mapping.timestampField] = eventTimestamp;
  }
  // Capture document URLs on completion
  if (mapping.status === 'completed') {
    if (data.documents?.[0]?.url || data.audit_log_url) {
      update.signed_document_url = data.documents?.[0]?.url || data.signed_document_url || null;
      update.audit_log_url = data.audit_log_url || null;
    } else if (data.submission?.audit_log_url) {
      update.audit_log_url = data.submission.audit_log_url;
    }
  }

  const { data: updated, error: updateError } = await supabase
    .from('docuseal_submissions')
    .update(update)
    .eq('id', submission.id)
    .select()
    .single();

  if (updateError) {
    logger.error('[DocusealWebhook] Update failed', updateError);
    await persistDocusealWebhookHealth(supabase, tenant_id, {
      sync_status: 'error',
      error_message: updateError.message,
    });
    return res.status(500).json({ error: 'update_failed' });
  }

  // 8. Create activity row
  try {
    const body =
      mapping.activity === 'document_completed'
        ? `${updated.recipient_email} completed signing ${updated.template_name || 'document'}.`
        : mapping.activity === 'document_signed'
          ? `${updated.recipient_email} signed ${updated.template_name || 'document'}.`
          : mapping.activity === 'document_viewed'
            ? `${updated.recipient_email} viewed ${updated.template_name || 'document'}.`
            : `${updated.recipient_email}: ${eventType.replace('submission.', '')}`;
    await createActivity(supabase, tenant_id, updated, mapping.activity, body);
  } catch (activityErr) {
    // Don't fail the webhook on activity errors — the submission update is the source of truth
    logger.warn('[DocusealWebhook] Activity creation failed', { error: activityErr.message });
  }

  // 8b. On completion, mirror the signed PDF into the generic `documents` table
  // so it appears in the entity's Documents paperclip section across all
  // detail panels (Contact / Lead / Account / Opportunity), not only the
  // DocuSeal-specific "Document Signatures" section. Idempotent via the
  // unique check on metadata.docuseal_submission_id.
  if (mapping.status === 'completed' && updated.signed_document_url) {
    try {
      const { data: existing } = await supabase
        .from('documents')
        .select('id')
        .eq('tenant_id', tenant_id)
        .eq('related_type', updated.related_to)
        .eq('related_id', updated.related_id)
        .filter('metadata->>docuseal_submission_id', 'eq', updated.docuseal_submission_id)
        .limit(1);

      if (!existing || existing.length === 0) {
        const docName = `${updated.template_name || 'Signed Document'} — ${updated.recipient_email}`;
        await supabase.from('documents').insert({
          tenant_id,
          name: docName.slice(0, 255),
          description: `Signed via DocuSeal on ${new Date(updated.completed_at || Date.now()).toISOString().slice(0, 10)} by ${updated.recipient_email}.`,
          file_url: updated.signed_document_url,
          file_type: 'application/pdf',
          related_type: updated.related_to,
          related_id: updated.related_id,
          metadata: {
            source: 'docuseal',
            docuseal_submission_id: updated.docuseal_submission_id,
            docuseal_template_id: updated.docuseal_template_id,
            audit_log_url: updated.audit_log_url || null,
            recipient_email: updated.recipient_email,
            recipient_name: updated.recipient_name,
          },
        });
      }
    } catch (docErr) {
      // Don't fail the webhook on documents-mirror errors — the signed URL
      // is still in docuseal_submissions and the activity log.
      logger.warn('[DocusealWebhook] documents-mirror insert failed', {
        error: docErr.message,
      });
    }
  }

  // 9. Mark integration healthy
  await persistDocusealWebhookHealth(supabase, tenant_id, {
    sync_status: 'connected',
    last_sync: new Date().toISOString(),
    error_message: null,
  });

  return res.status(200).json({ ok: true, status: mapping.status });
});

export default router;
