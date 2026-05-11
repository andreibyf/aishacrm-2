// @ts-check
/**
 * Signing Submissions routes (4VD-43 day 2).
 *
 * One row per recipient per send. POST /api/submissions creates the row,
 * generates a 32-byte hex `signing_token`, fires a tenant-branded email
 * with the public /sign/<slug>/<token> link, and returns the row.
 *
 * Tenant isolation: every route requires req.tenant.id from
 * validateTenantAccess. Backend writes use service_role (bypasses RLS) but
 * always stamp tenant_id from the request context, never from client input.
 *
 * Role gate: writes here are NOT admin-only (deliberate — sales reps + AEs
 * send NDAs/quotes routinely). Template create/edit/delete are admin-only;
 * sending an existing template is open to anyone with DocumentTemplates
 * page access.
 *
 * Mounted at /api/submissions in server.js.
 */

import express from 'express';
import crypto from 'node:crypto';
import { getSupabaseClient } from '../lib/supabase-db.js';
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';
import { sendTenantEmail } from '../lib/sendTenantEmail.js';
import { buildSigningRequestEmail } from '../lib/buildSigningRequestEmail.js';
import { createSendActivity } from '../lib/signingActivityTracker.js';
import { requireAdminRole } from '../middleware/validateTenant.js';
import { resolveRequestTenantId } from './templates.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const RELATED_TO_VALUES = new Set(['contact', 'lead', 'account', 'opportunity']);
const MAX_RECIPIENT_NAME_LENGTH = 200;
const MAX_MESSAGE_LENGTH = 2000;
const SIGNING_TOKEN_BYTES = 32;
const UUID_RE = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
// Conservative RFC 5322-ish email regex. Backend gate; the frontend's
// type=email input does the friendly UX.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Generate a 32-byte (64-hex-char) random capability token. The /sign route
 * looks up signing_sessions by this value. 256 bits of entropy is overkill
 * for a 14-day capability; this is the same range used by GitHub PATs and
 * Stripe restricted keys.
 *
 * @returns {string}
 */
export function generateSigningToken() {
  return crypto.randomBytes(SIGNING_TOKEN_BYTES).toString('hex');
}

/**
 * Validate POST /api/submissions body. Throws RangeError/TypeError with a
 * `code` field describing the failure. Returns the trimmed/normalised input
 * on success.
 *
 * @param {unknown} input
 * @returns {{
 *   templateId: string,
 *   relatedTo: string,
 *   relatedId: string,
 *   recipientEmail: string,
 *   recipientName: string|null,
 *   message: string|null
 * }}
 */
export function validateSubmissionInput(input) {
  if (!input || typeof input !== 'object') {
    const err = new TypeError('body must be an object');
    err.code = 'invalid_body';
    throw err;
  }

  const obj = /** @type {Record<string, unknown>} */ (input);

  if (typeof obj.template_id !== 'string' || !UUID_RE.test(obj.template_id.trim())) {
    const err = new RangeError('template_id must be a UUID');
    err.code = 'invalid_template_id';
    throw err;
  }
  if (typeof obj.related_to !== 'string' || !RELATED_TO_VALUES.has(obj.related_to.trim())) {
    const err = new RangeError(`related_to must be one of: ${[...RELATED_TO_VALUES].join(', ')}`);
    err.code = 'invalid_related_to';
    throw err;
  }
  if (typeof obj.related_id !== 'string' || !UUID_RE.test(obj.related_id.trim())) {
    const err = new RangeError('related_id must be a UUID');
    err.code = 'invalid_related_id';
    throw err;
  }
  if (typeof obj.recipient_email !== 'string') {
    const err = new TypeError('recipient_email must be a string');
    err.code = 'invalid_recipient_email';
    throw err;
  }
  const recipientEmail = obj.recipient_email.trim().toLowerCase();
  if (!EMAIL_RE.test(recipientEmail)) {
    const err = new RangeError('recipient_email is not a valid email address');
    err.code = 'invalid_recipient_email';
    throw err;
  }

  let recipientName = null;
  if (obj.recipient_name !== undefined && obj.recipient_name !== null) {
    if (typeof obj.recipient_name !== 'string') {
      const err = new TypeError('recipient_name must be a string when provided');
      err.code = 'invalid_recipient_name';
      throw err;
    }
    const trimmed = obj.recipient_name.trim();
    if (trimmed.length > MAX_RECIPIENT_NAME_LENGTH) {
      const err = new RangeError(`recipient_name must be ≤${MAX_RECIPIENT_NAME_LENGTH} chars`);
      err.code = 'invalid_recipient_name';
      throw err;
    }
    recipientName = trimmed.length > 0 ? trimmed : null;
  }

  let message = null;
  if (obj.message !== undefined && obj.message !== null) {
    if (typeof obj.message !== 'string') {
      const err = new TypeError('message must be a string when provided');
      err.code = 'invalid_message';
      throw err;
    }
    const trimmed = obj.message.trim();
    if (trimmed.length > MAX_MESSAGE_LENGTH) {
      const err = new RangeError(`message must be ≤${MAX_MESSAGE_LENGTH} chars`);
      err.code = 'invalid_message';
      throw err;
    }
    message = trimmed.length > 0 ? trimmed : null;
  }

  return {
    templateId: obj.template_id.trim(),
    relatedTo: obj.related_to.trim(),
    relatedId: obj.related_id.trim(),
    recipientEmail,
    recipientName,
    message,
  };
}

/**
 * Compose the public /sign/<slug>/<token> URL. The slug today is just the
 * tenant slug for cosmetics + path-level tenant disambiguation; the
 * authoritative gate is signing_token. The route signature itself will
 * tighten to /sign/:token on day 4 — this helper is the single seam to
 * change at that point.
 *
 * @param {string} frontendUrl  — e.g. http://localhost:4000 or https://app.aishacrm.com
 * @param {string} tenantSlug   — used for cosmetics + path disambiguation
 * @param {string} signingToken
 * @returns {string}
 */
export function buildSigningUrl(frontendUrl, tenantSlug, signingToken) {
  const base = String(frontendUrl || '').replace(/\/+$/, '');
  const slug = encodeURIComponent(String(tenantSlug || 'sign'));
  const token = encodeURIComponent(String(signingToken || ''));
  return `${base}/sign/${slug}/${token}`;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * Factory for the /api/submissions express router.
 *
 * @param {object} [deps] - Optional DI overrides (test seam). Production code
 *   leaves this empty so the real Supabase factories are used.
 * @param {() => any} [deps.getSupabaseClient]  override of getSupabaseClient
 * @param {() => any} [deps.getSupabaseAdmin]   override of getSupabaseAdmin
 */
export default function createSubmissionsRoutes(deps = {}) {
  const supabaseClientFn = deps.getSupabaseClient || getSupabaseClient;
  const supabaseAdminFn = deps.getSupabaseAdmin || getSupabaseAdmin;
  const router = express.Router();

  // --- POST /api/submissions ----------------------------------------------
  // Body: { template_id, related_to, related_id, recipient_email,
  //         recipient_name?, message? }
  // Open to all roles with DocumentTemplates page access (no requireAdminRole).
  router.post('/', async (req, res) => {
    const tenantId = resolveRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }

    let parsed;
    try {
      parsed = validateSubmissionInput(req.body);
    } catch (err) {
      return res.status(400).json({
        error: err.code || 'invalid_body',
        message: err.message,
      });
    }

    const supabase = supabaseClientFn();

    // Verify the template belongs to this tenant + is active. Defends
    // against a client who guessed a UUID from another tenant.
    const { data: template, error: tplErr } = await supabase
      .from('signing_templates')
      .select('id, name, archived_at')
      .eq('tenant_id', tenantId)
      .eq('id', parsed.templateId)
      .maybeSingle();
    if (tplErr) {
      logger.error('[Submissions] Template lookup failed', {
        tenantId,
        templateId: parsed.templateId,
        message: tplErr.message,
      });
      return res.status(500).json({ error: 'lookup_failed', message: tplErr.message });
    }
    if (!template || template.archived_at) {
      return res.status(404).json({ error: 'template_not_found' });
    }

    // Pull tenant branding for the email + slug for the URL.
    const { data: tenantRow, error: tenantErr } = await supabase
      .from('tenant')
      .select('id, tenant_id, name, branding_settings, metadata')
      .eq('id', tenantId)
      .maybeSingle();
    if (tenantErr) {
      logger.error('[Submissions] Tenant lookup failed', {
        tenantId,
        message: tenantErr.message,
      });
      return res.status(500).json({ error: 'tenant_lookup_failed', message: tenantErr.message });
    }
    if (!tenantRow) {
      return res.status(500).json({ error: 'tenant_not_found' });
    }

    // Mint the capability token + insert the row.
    const signingToken = generateSigningToken();
    const { data: row, error: insertErr } = await supabase
      .from('signing_sessions')
      .insert({
        tenant_id: tenantId,
        template_id: parsed.templateId,
        related_to: parsed.relatedTo,
        related_id: parsed.relatedId,
        recipient_email: parsed.recipientEmail,
        recipient_name: parsed.recipientName,
        signing_token: signingToken,
        message: parsed.message,
      })
      .select(
        'id, tenant_id, template_id, related_to, related_id, recipient_email, recipient_name, signing_token, status, message, created_at, expires_at',
      )
      .single();
    if (insertErr) {
      logger.error('[Submissions] Insert failed', {
        tenantId,
        templateId: parsed.templateId,
        message: insertErr.message,
      });
      return res.status(500).json({ error: 'insert_failed', message: insertErr.message });
    }

    // Email send — non-fatal: if SMTP is unconfigured or the provider
    // refuses, the row still exists and the operator can resend later.
    // We surface the email status in the response so the UI can warn.
    const frontendUrl =
      process.env.FRONTEND_URL || process.env.PUBLIC_FRONTEND_URL || 'http://localhost:4000';
    const signingUrl = buildSigningUrl(frontendUrl, tenantRow.tenant_id, signingToken);
    const senderName = req.user?.full_name || req.user?.email || null;
    let emailResult = { ok: false, reason: 'not_attempted' };
    try {
      const built = buildSigningRequestEmail({
        tenant: tenantRow,
        signingUrl,
        templateName: template.name,
        recipientName: parsed.recipientName || undefined,
        senderName: senderName || undefined,
        message: parsed.message || undefined,
        expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      });
      emailResult = await sendTenantEmail({
        tenantId,
        to: parsed.recipientEmail,
        recipientName: parsed.recipientName || undefined,
        subject: built.subject,
        html: built.html,
        text: built.text,
        replyTo: req.user?.email || undefined,
      });
      if (emailResult.ok) {
        // Mark the row 'sent' (status enum: pending|viewed|signed|completed|
        // declined|expired). We use 'pending' as the schema default, but a
        // successful send is closer to the GoHighLevel/DocuSeal "sent"
        // semantic. Reuse 'pending' since the status enum doesn't include
        // 'sent' — the schema doesn't distinguish between "row exists but
        // email failed" and "row exists and email delivered." Future
        // refinement: add a separate boolean email_sent column or extend
        // the enum.
      } else {
        logger.warn('[Submissions] Email send failed (row still created)', {
          tenantId,
          submissionId: row.id,
          reason: emailResult.reason,
        });
      }
    } catch (err) {
      logger.error('[Submissions] Email build/send threw', {
        tenantId,
        submissionId: row.id,
        message: err?.message || String(err),
      });
      emailResult = { ok: false, reason: 'send_threw', error: err?.message };
    }

    // 4VD-43 day 4: best-effort activity row so the entity timeline shows
    // "Document sent — <template>" with a next-day Follow up by, recipient
    // name, and lifecycle updates as the recipient acts. Non-fatal — a
    // failure here does NOT undo the signing_session that was just
    // created. Logged inside the tracker.
    createSendActivity({
      supabase,
      tenantId,
      session: row,
      templateName: template.name,
      sentByUserId: req.user?.id || null,
      sentByUserEmail: req.user?.email || null,
    }).catch(() => undefined);

    return res.status(201).json({
      data: row,
      email: {
        ok: !!emailResult.ok,
        reason: emailResult.reason || null,
        provider: emailResult.provider || null,
      },
    });
  });

  // --- GET /api/submissions -----------------------------------------------
  // Query params (all optional):
  //   related_to + related_id  — scope to a single CRM entity (panels)
  //   include_archived         — include rows with completed_at/declined_at
  //                              older than now() (default: include all
  //                              non-expired)
  router.get('/', async (req, res) => {
    const tenantId = resolveRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }

    const relatedTo = typeof req.query.related_to === 'string' ? req.query.related_to.trim() : '';
    const relatedId = typeof req.query.related_id === 'string' ? req.query.related_id.trim() : '';

    if (relatedTo && !RELATED_TO_VALUES.has(relatedTo)) {
      return res.status(400).json({
        error: 'invalid_related_to',
        message: `related_to must be one of: ${[...RELATED_TO_VALUES].join(', ')}`,
      });
    }
    if (relatedId && !UUID_RE.test(relatedId)) {
      return res.status(400).json({ error: 'invalid_related_id' });
    }

    const supabase = supabaseClientFn();
    let query = supabase
      .from('signing_sessions')
      .select(
        'id, template_id, related_to, related_id, recipient_email, recipient_name, status, message, created_at, expires_at, viewed_at, signed_at, completed_at, declined_at, signed_pdf_storage_path, archived_at, archive_reason, archived_by',
      )
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false });

    if (relatedTo && relatedId) {
      query = query.eq('related_to', relatedTo).eq('related_id', relatedId);
    }

    const { data, error } = await query;
    if (error) {
      logger.error('[Submissions] List failed', { tenantId, message: error.message });
      return res.status(500).json({ error: 'list_failed', message: error.message });
    }

    return res.json({ data: data || [] });
  });

  // --- GET /api/submissions/:id -------------------------------------------
  router.get('/:id', async (req, res) => {
    const tenantId = resolveRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }
    const supabase = supabaseClientFn();
    const { data, error } = await supabase
      .from('signing_sessions')
      .select(
        'id, template_id, related_to, related_id, recipient_email, recipient_name, status, message, created_at, expires_at, viewed_at, signed_at, completed_at, declined_at, signed_pdf_storage_path, archived_at, archive_reason, archived_by',
      )
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (error) {
      logger.error('[Submissions] Read failed', {
        tenantId,
        id: req.params.id,
        message: error.message,
      });
      return res.status(500).json({ error: 'read_failed', message: error.message });
    }
    if (!data) {
      return res.status(404).json({ error: 'not_found' });
    }
    return res.json({ data });
  });

  // --- GET /api/submissions/:id/signed-pdf-url ----------------------------
  // Returns a 5-minute Supabase Storage signed URL for the signed PDF
  // (stamped + Certificate of Completion). Frontend opens the URL directly
  // — backend doesn't proxy the bytes. Tenant-scoped: the row lookup is
  // gated by tenant_id, and the storage path itself is `<tenant_id>/signed/...`
  // so even a leaked URL only exposes one specific signed object.
  //
  // Returns 404 when the session row exists but signed_pdf_storage_path is
  // still null (i.e. finalize hasn't run yet — session is at status
  // pending/viewed/signed but not completed). The UI should hide the link
  // for those rows; this is a belt-and-suspenders guard.
  router.get('/:id/signed-pdf-url', async (req, res) => {
    const tenantId = resolveRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }
    const supabase = supabaseClientFn();
    const { data: row, error: lookupErr } = await supabase
      .from('signing_sessions')
      .select('id, signed_pdf_storage_path, status, archived_at')
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (lookupErr) {
      logger.error('[Submissions] signed-pdf-url lookup failed', {
        tenantId,
        id: req.params.id,
        message: lookupErr.message,
      });
      return res.status(500).json({ error: 'lookup_failed', message: lookupErr.message });
    }
    if (!row) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (!row.signed_pdf_storage_path) {
      // Signing not finalized — no stored PDF to hand out yet.
      return res.status(404).json({
        error: 'signed_pdf_not_available',
        message: 'Signed PDF is not yet available for this submission.',
      });
    }

    const storageAdmin = supabaseAdminFn();
    const bucket = getBucketName();
    const ttlSeconds = 300; // 5 minutes
    const { data: signed, error: signErr } = await storageAdmin.storage
      .from(bucket)
      .createSignedUrl(row.signed_pdf_storage_path, ttlSeconds);
    if (signErr || !signed?.signedUrl) {
      logger.error('[Submissions] signed-pdf-url sign failed', {
        tenantId,
        id: row.id,
        path: row.signed_pdf_storage_path,
        message: signErr?.message,
      });
      return res.status(503).json({
        error: 'sign_failed',
        message: signErr?.message || 'unable to mint signed url',
      });
    }
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();
    return res.json({ data: { url: signed.signedUrl, expires_at: expiresAt } });
  });

  // --- POST /api/submissions/:id/archive ----------------------------------
  // Soft-delete with mandatory reason. Admin-only (per Q1 product
  // decision). Allowed on any status, including signed/completed (per Q2)
  // — the audit jsonb keeps the legal chain regardless and the UI line-
  // throughs the row to signal "this was archived after signing." See
  // migration 166_signing_sessions_archive_columns.sql for the schema.
  router.post('/:id/archive', requireAdminRole, async (req, res) => {
    const tenantId = resolveRequestTenantId(req);
    if (!tenantId) {
      return res.status(400).json({ error: 'tenant_context_missing' });
    }

    const reasonRaw = req.body?.reason;
    if (typeof reasonRaw !== 'string') {
      return res.status(400).json({
        error: 'reason_required',
        message: 'A reason is required when archiving a signing session.',
      });
    }
    const reason = reasonRaw.trim();
    if (reason.length === 0) {
      return res.status(400).json({
        error: 'reason_required',
        message: 'A reason is required when archiving a signing session.',
      });
    }
    if (reason.length > 1000) {
      return res.status(400).json({
        error: 'reason_too_long',
        message: 'Reason must be ≤1000 characters.',
      });
    }

    const supabase = supabaseClientFn();
    // Look up the row to confirm it exists in the tenant + isn't already
    // archived (idempotency — re-archiving a row should be a no-op, not
    // an error).
    const { data: existing, error: lookupErr } = await supabase
      .from('signing_sessions')
      .select('id, archived_at, audit')
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .maybeSingle();
    if (lookupErr) {
      logger.error('[Submissions] Archive lookup failed', {
        tenantId,
        id: req.params.id,
        message: lookupErr.message,
      });
      return res.status(500).json({ error: 'lookup_failed', message: lookupErr.message });
    }
    if (!existing) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (existing.archived_at) {
      // Idempotent: already archived. Return 200 with current row so the
      // UI can refresh without surfacing a "you already deleted this" toast.
      return res.json({ data: existing, already_archived: true });
    }

    // Append an audit entry so the legal chain reflects the archive event.
    const auditEntry = {
      at: new Date().toISOString(),
      action: 'archived',
      ip: req.ip || null,
      ua: (req.headers?.['user-agent'] || '').slice(0, 1024) || null,
      reason,
      by: req.user?.id || null,
    };
    const newAudit = Array.isArray(existing.audit) ? [...existing.audit, auditEntry] : [auditEntry];

    const { data, error } = await supabase
      .from('signing_sessions')
      .update({
        archived_at: new Date().toISOString(),
        archive_reason: reason,
        archived_by: req.user?.id || null,
        audit: newAudit,
      })
      .eq('tenant_id', tenantId)
      .eq('id', req.params.id)
      .is('archived_at', null) // belt-and-suspenders against race
      .select('id, status, archived_at, archive_reason, archived_by')
      .maybeSingle();
    if (error) {
      logger.error('[Submissions] Archive update failed', {
        tenantId,
        id: req.params.id,
        message: error.message,
      });
      return res.status(500).json({ error: 'archive_failed', message: error.message });
    }
    if (!data) {
      // Race: another writer archived it between our lookup and update.
      // Treat as already-archived (idempotent).
      return res.json({ data: { id: req.params.id }, already_archived: true });
    }

    return res.json({ data });
  });

  return router;
}
