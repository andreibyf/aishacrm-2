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
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';

const router = express.Router();

// ---------------------------------------------------------------------------
// Constants for the Supabase Storage mirror (4VD-13)
// ---------------------------------------------------------------------------

const DOCUSEAL_FETCH_TIMEOUT_MS = 30_000; // signed PDFs can be a few MB
const DOCUSEAL_PDF_CONTENT_TYPE = 'application/pdf';

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
 * Verify the inbound webhook is from a tenant we trust.
 *
 * DocuSeal Community's webhook_url.secret is a JSON hash that's spread as
 * HTTP headers on every outbound webhook (Ruby: `**webhook_url.secret.to_h`).
 * It is NOT an HMAC — it's a static shared secret typed by the operator in
 * the DocuSeal admin UI ("Webhook Secret" dialog with Key + Value fields).
 *
 * Community-deployment auth model: operator sets
 *   Key   = X-Docuseal-Signature
 *   Value = <the same 64-char hex stored on tenant_integrations.api_credentials.webhook_secret>
 * and we verify the inbound `x-docuseal-signature` header equals the stored
 * secret via constant-time compare. The slug in /s/:slug is itself a per-
 * submitter UUID capability token, so a leaked secret would let an attacker
 * forge completion events but couldn't enumerate other tenants' submissions.
 *
 * Pro/Cloud-deployment auth model (future): if DocuSeal Pro adds real
 * HMAC-SHA256 signing (`X-Docuseal-Signature: sha256=<hex>`), we fall back
 * to HMAC verification — detected by the `sha256=` prefix on the header.
 */
export function verifyDocusealSignature(rawBody, signatureHeader, secret) {
  if (!secret || !signatureHeader) return false;

  // HMAC-SHA256 mode (DocuSeal Pro-style; kept for forward compatibility).
  if (signatureHeader.startsWith('sha256=')) {
    const computedHex = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
    const incoming = signatureHeader.slice(7);
    try {
      return (
        incoming.length === computedHex.length &&
        crypto.timingSafeEqual(Buffer.from(incoming), Buffer.from(computedHex))
      );
    } catch {
      return false;
    }
  }

  // Static-secret mode (DocuSeal Community — the production case for this CRM).
  try {
    return (
      signatureHeader.length === secret.length &&
      crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(secret))
    );
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

export const STATUS_RANK = {
  pending: 0,
  sent: 1,
  viewed: 2,
  signed: 3,
  completed: 4,
  declined: 4,
  expired: 4,
  failed: 4,
};

export function canTransition(currentStatus, newStatus) {
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
// Supabase Storage mirror (4VD-13)
//
// On submission.completed we fetch the signed PDF from DocuSeal and upload it
// into the tenant-assets bucket so the document survives a DocuSeal volume
// loss. Best-effort: any failure is logged and swallowed — the webhook still
// returns 200 and signed_document_url remains the DocuSeal-hosted URL.
// ---------------------------------------------------------------------------

/**
 * Sanitize a free-form template name into a filesystem-safe slug.
 * Replaces anything outside [A-Za-z0-9._-] with '_' and trims length.
 */
export function sanitizeTemplateName(name) {
  const fallback = 'document';
  if (!name || typeof name !== 'string') return fallback;
  const slug = name
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
  return (slug || fallback).slice(0, 80);
}

/**
 * Compose the canonical Supabase Storage object key for a mirrored signed PDF.
 *   uploads/{tenant_id}/docuseal/{submission_id}_{template}.pdf
 */
export function buildDocusealStorageKey({ tenantId, submissionId, templateName }) {
  const safeTemplate = sanitizeTemplateName(templateName);
  return `uploads/${tenantId}/docuseal/${submissionId}_${safeTemplate}.pdf`;
}

/**
 * Fetch the signed PDF from DocuSeal with a hard timeout and return the bytes
 * as a Buffer. The DocuSeal-hosted signed_document_url is generally accessible
 * unauthenticated (it's the same URL emailed to recipients), but we send the
 * tenant API key as X-Auth-Token in case the tenant configured private docs.
 */
export async function fetchDocusealSignedPdf({ url, apiKey, fetchImpl = fetch }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DOCUSEAL_FETCH_TIMEOUT_MS);
  try {
    const headers = { Accept: DOCUSEAL_PDF_CONTENT_TYPE };
    if (apiKey) headers['X-Auth-Token'] = apiKey;
    const res = await fetchImpl(url, { headers, signal: controller.signal });
    if (!res.ok) {
      throw new Error(`docuseal_pdf_fetch_failed: HTTP ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Mirror a signed PDF into Supabase Storage and update the related rows.
 * Pure-ish helper: receives explicit clients/fetch so it can be unit-tested
 * without a network or a real Supabase project.
 *
 * Idempotency: caller is expected to short-circuit when
 * docuseal_submissions.supabase_storage_path IS NOT NULL — this helper does
 * not re-check, so it can be invoked from a backfill script too.
 *
 * Returns { storagePath, publicUrl, bytesUploaded } on success. Throws on
 * any unrecoverable error so the caller can decide whether to swallow it.
 */
export async function mirrorSignedPdfToStorage({
  supabase,
  storageAdmin,
  bucket,
  tenantId,
  submission, // existing docuseal_submissions row (must include id, signed_document_url, docuseal_submission_id, template_name)
  apiKey, // tenant DocuSeal API key (optional, sent as X-Auth-Token)
  fetchImpl = fetch,
}) {
  if (!submission?.signed_document_url) {
    throw new Error('mirror_skipped: no signed_document_url');
  }

  const storagePath = buildDocusealStorageKey({
    tenantId,
    submissionId: submission.docuseal_submission_id,
    templateName: submission.template_name,
  });

  // 1. Pull the PDF
  const pdfBuffer = await fetchDocusealSignedPdf({
    url: submission.signed_document_url,
    apiKey,
    fetchImpl,
  });

  // 2. Upload to Supabase Storage (upsert so backfills replace any partial mirror)
  const { error: uploadError } = await storageAdmin.storage
    .from(bucket)
    .upload(storagePath, pdfBuffer, {
      contentType: DOCUSEAL_PDF_CONTENT_TYPE,
      upsert: true,
    });
  if (uploadError) {
    throw new Error(`storage_upload_failed: ${uploadError.message}`);
  }

  // 3. Resolve a durable URL for the documents.file_url flip. Public bucket
  //    yields a public URL; if the bucket is private, fall back to a 7-day
  //    signed URL (storage.js uses the same pattern). The frontend already
  //    handles both shapes via UniversalDetailPanel.
  let publicUrl = null;
  try {
    const { data: pub } = storageAdmin.storage.from(bucket).getPublicUrl(storagePath);
    publicUrl = pub?.publicUrl || null;
  } catch (err) {
    logger.debug('[DocusealWebhook] getPublicUrl threw', { error: err.message });
  }
  if (!publicUrl) {
    try {
      const { data: signed, error: signErr } = await storageAdmin.storage
        .from(bucket)
        .createSignedUrl(storagePath, 60 * 60 * 24 * 7);
      if (!signErr && signed?.signedUrl) publicUrl = signed.signedUrl;
    } catch (err) {
      logger.debug('[DocusealWebhook] createSignedUrl threw', { error: err.message });
    }
  }

  // 4. Persist the storage path on docuseal_submissions
  const { error: updErr } = await supabase
    .from('docuseal_submissions')
    .update({ supabase_storage_path: storagePath })
    .eq('id', submission.id);
  if (updErr) {
    // Mirror is uploaded but DB pointer didn't land — surface so the caller
    // can log; the bytes are durable, retry will overwrite via upsert.
    throw new Error(`storage_path_update_failed: ${updErr.message}`);
  }

  // 5. Flip documents.file_url to the durable Supabase URL (if a row exists
  //    from the documents-mirror in the original step 8b). Only the URL is
  //    changed; metadata.docuseal_submission_id remains the join key.
  if (publicUrl) {
    const { error: docErr } = await supabase
      .from('documents')
      .update({ file_url: publicUrl })
      .eq('tenant_id', tenantId)
      .filter('metadata->>docuseal_submission_id', 'eq', submission.docuseal_submission_id);
    if (docErr) {
      // Non-fatal — the storage path itself is recorded.
      logger.warn('[DocusealWebhook] documents.file_url flip failed', { error: docErr.message });
    }
  }

  return {
    storagePath,
    publicUrl,
    bytesUploaded: pdfBuffer.length,
  };
}

// ---------------------------------------------------------------------------
// Event dispatcher — maps DocuSeal event types to status + activity
// ---------------------------------------------------------------------------

/**
 * DocuSeal Community → CRM event mapping.
 *
 * The full DocuSeal v1.10+ admin webhook event list is:
 *
 *   form.viewed     form.started    form.completed   form.declined
 *   submission.created    submission.completed   submission.expired   submission.archived
 *   template.created      template.updated       template.archived
 *
 * Of those, the events that mean something for our CRM lifecycle are
 * mapped below. Unmapped events (form.started's submission counterpart,
 * archive events, template events) get a 200 + ignored response so DocuSeal
 * doesn't retry, but their last_event_id still updates so a future
 * revision can pick them up idempotently.
 *
 * Naming notes:
 *   - DocuSeal renamed `submission.declined` → `form.declined` somewhere
 *     between MVP rollout and 2026-05. We map BOTH so older DocuSeal
 *     installs (or future revivals) keep working.
 *   - `form.started` fires on first open of the signing form. Treat it as
 *     equivalent to `form.viewed` — same status, same activity, same
 *     1-hour dedupe in createActivity. Some installs only fire `started`
 *     and never `viewed`; some fire both. Mapping both is harmless because
 *     the dedupe in createActivity collapses duplicate activities and
 *     canTransition rejects the second status update.
 *
 * EVENT_MAP is exported so unit tests can assert the contract without
 * spinning up the route handler.
 */
export const EVENT_MAP = {
  'form.viewed': { status: 'viewed', activity: 'document_viewed', timestampField: 'viewed_at' },
  'form.started': { status: 'viewed', activity: 'document_viewed', timestampField: 'viewed_at' },
  'form.completed': { status: 'signed', activity: 'document_signed', timestampField: null },
  'form.declined': {
    status: 'declined',
    activity: 'document_declined',
    timestampField: null,
  },
  'submission.completed': {
    status: 'completed',
    activity: 'document_completed',
    timestampField: 'completed_at',
  },
  'submission.declined': {
    status: 'declined',
    activity: 'document_declined',
    timestampField: null,
  },
  'submission.expired': { status: 'expired', activity: 'document_expired', timestampField: null },
};

// ---------------------------------------------------------------------------
// Main webhook handler
// ---------------------------------------------------------------------------

router.post('/docuseal', async (req, res) => {
  const supabase = getSupabaseClient();
  const rawBody = req.rawBody || (Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
  const signatureHeader =
    req.headers['x-docuseal-signature'] || req.headers['X-Docuseal-Signature'];

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
    payload =
      typeof req.body === 'object' && !Buffer.isBuffer(req.body)
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
    logger.warn('[DocusealWebhook] Missing event_type or submission id', {
      eventType,
      docusealSubmissionId,
    });
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
    logger.info('[DocusealWebhook] Unknown submission id; ignoring', {
      tenant_id,
      docusealSubmissionId,
      eventType,
    });
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

    // 8c. (4VD-13) Mirror the signed PDF into Supabase Storage so we don't
    // depend on DocuSeal's container volume for durability. Idempotent via
    // the supabase_storage_path NULL guard. Best-effort: any failure is
    // logged and swallowed so the webhook never returns 5xx for a mirror
    // miss. The DocuSeal-hosted signed_document_url remains valid in the
    // meantime; a future event or backfill job can re-attempt.
    if (!updated.supabase_storage_path) {
      try {
        const apiKey = matched.integration?.api_key || null;
        const result = await mirrorSignedPdfToStorage({
          supabase,
          storageAdmin: getSupabaseAdmin(),
          bucket: getBucketName(),
          tenantId: tenant_id,
          submission: updated,
          apiKey,
        });
        logger.info('[DocusealWebhook] Signed PDF mirrored to Supabase Storage', {
          tenantId: tenant_id,
          submissionId: updated.docuseal_submission_id,
          storagePath: result.storagePath,
          bytes: result.bytesUploaded,
        });
      } catch (mirrorErr) {
        // Surface the error.message directly in the log message string so
        // pino-pretty doesn't drop it. Stack trace stays in metadata for the
        // structured backend.
        logger.warn(`[DocusealWebhook] Storage mirror failed (non-fatal): ${mirrorErr.message}`, {
          tenantId: tenant_id,
          submissionId: updated.docuseal_submission_id,
          stack: mirrorErr.stack,
        });
      }
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
