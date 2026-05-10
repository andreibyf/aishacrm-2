// @ts-check
/**
 * Public sign routes (4VD-43 day 3).
 *
 * The recipient of a signing email is NOT a CRM user. These routes are
 * unauthenticated and gated solely on the 64-hex `signing_token` issued by
 * POST /api/submissions. RLS bypass via service-role is OK here because the
 * route enforces all isolation invariants itself:
 *
 *   - Token must be exactly 64 hex chars (rejects guessing + log-spam).
 *   - Row must not be expired/declined/completed (state machine below).
 *   - Service role only ever queries by `signing_token = ?` so a leak of
 *     this code can't pivot to other tenants' data.
 *
 * State machine:
 *
 *           ┌─────────┐
 *           │ pending │
 *           └────┬────┘
 *                │ first GET
 *           ┌────▼────┐
 *           │ viewed  │
 *           └────┬────┘
 *                │ POST /submit
 *           ┌────▼────┐
 *           │ signed  │  ← day 5 will then trigger pdf-lib stamping +
 *           └────┬────┘    transition to 'completed'
 *                │
 *      ┌─────────┼─────────┐
 *      │         │         │
 *  declined  expired   completed
 *
 *   any → declined  via POST /decline
 *   any → expired   via expires_at (server-side check on every read)
 *
 * Audit jsonb is the legal trail (ESIGN Act + eIDAS admissibility):
 * every state-changing action appends an entry of the form
 *   { at: <iso>, action: 'viewed'|'signed'|'declined', ip, ua, [reason] }.
 * Append-only — never replace, never reorder.
 *
 * Mounted at /api/sign in server.js with publicLimiter only.
 */

import express from 'express';
import { getSupabaseAdmin, getBucketName } from '../lib/supabaseFactory.js';
import logger from '../lib/logger.js';
import { finalizeSigningSession } from '../lib/finalizeSigningSession.js';
import {
  updateActivityForView,
  updateActivityForSign,
  updateActivityForDecline,
} from '../lib/signingActivityTracker.js';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIGNING_TOKEN_RE = /^[0-9a-f]{64}$/;
const TERMINAL_STATUSES = new Set(['signed', 'completed', 'declined', 'expired']);
const MAX_DECLINE_REASON_LENGTH = 1000;
const MAX_FIELD_VALUE_STRING_LENGTH = 5000;
const MAX_SIGNATURE_DATA_URL_BYTES = 1_500_000; // ~1.5MB worth of base64 PNG
const MAX_SIGNER_NAME_LENGTH = 200;
const SIGNATURE_DATA_URL_RE = /^data:image\/(png|jpe?g);base64,[A-Za-z0-9+/=]+$/;

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

/**
 * Validate a 64-hex signing_token. Rejects anything else fast — defends
 * against log spam + makes timing attacks impractical.
 *
 * @param {unknown} token
 * @returns {boolean}
 */
export function isValidSigningToken(token) {
  return typeof token === 'string' && SIGNING_TOKEN_RE.test(token);
}

/**
 * Extract the recipient's IP from an Express request, preferring
 * X-Forwarded-For's FIRST hop (the real client) over the connection IP
 * (which would be the cloudflared/proxy IP in our topology).
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function extractClientIp(req) {
  // Express's req.ip honours `trust proxy` setting; in the AiSHA setup we
  // trust cloudflared, so req.ip is already the first XFF hop. We still
  // fall back to the raw header in case proxy trust is misconfigured in
  // a future deploy.
  if (typeof req?.ip === 'string' && req.ip.length > 0) return req.ip;
  const xff = req?.headers?.['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    return xff.split(',')[0].trim();
  }
  if (Array.isArray(xff) && xff.length > 0) {
    return String(xff[0]).split(',')[0].trim();
  }
  return null;
}

/**
 * Extract the recipient's User-Agent. Truncated to 1KB so a pathological
 * client can't bloat the audit jsonb.
 *
 * @param {import('express').Request} req
 * @returns {string|null}
 */
export function extractClientUa(req) {
  const ua = req?.headers?.['user-agent'];
  if (typeof ua !== 'string') return null;
  return ua.slice(0, 1024);
}

/**
 * Build an audit entry. Exported so tests can pin the shape.
 *
 * @param {Object} params
 * @param {'viewed'|'signed'|'declined'} params.action
 * @param {string|null} params.ip
 * @param {string|null} params.ua
 * @param {string} [params.reason]
 * @param {Date} [params.at] — override for testing; defaults to now
 * @returns {object}
 */
export function makeAuditEntry({ action, ip, ua, reason, at }) {
  const entry = {
    at: (at instanceof Date ? at : new Date()).toISOString(),
    action,
    ip: ip || null,
    ua: ua || null,
  };
  if (reason !== undefined && reason !== null && reason !== '') {
    entry.reason = String(reason).slice(0, MAX_DECLINE_REASON_LENGTH);
  }
  return entry;
}

/**
 * Append an audit entry to an existing audit jsonb array. Pure — returns
 * a new array, never mutates the input. Cap at 1000 entries to bound
 * pathological replay loops.
 *
 * @param {unknown} existing
 * @param {object} entry
 * @returns {object[]}
 */
export function appendAudit(existing, entry) {
  const arr = Array.isArray(existing) ? existing.slice() : [];
  arr.push(entry);
  if (arr.length > 1000) {
    return arr.slice(-1000);
  }
  return arr;
}

/**
 * Validate POST /sign/:token/submit body against the template's field
 * definitions. Throws RangeError/TypeError with a `code` on failure;
 * returns the normalised values map on success.
 *
 * Required fields must be present and non-empty. Unknown field names are
 * stripped (defense against malicious clients trying to inject arbitrary
 * keys into the field_values jsonb). Signature data URLs are validated
 * for shape + size.
 *
 * @param {unknown} body
 * @param {Array<{name: string, type: string, required: boolean}>} templateFields
 * @returns {{ field_values: Record<string, unknown>, signature_data_url: string|null }}
 */
export function validateSubmitInput(body, templateFields) {
  if (!body || typeof body !== 'object') {
    const err = new TypeError('body must be an object');
    err.code = 'invalid_body';
    throw err;
  }
  const obj = /** @type {Record<string, unknown>} */ (body);

  if (!Array.isArray(templateFields)) {
    const err = new TypeError('templateFields must be an array');
    err.code = 'invalid_template';
    throw err;
  }

  const incoming =
    obj.field_values && typeof obj.field_values === 'object'
      ? /** @type {Record<string, unknown>} */ (obj.field_values)
      : {};

  // Pass 0 — parse + validate the top-level signer_name and signature_data_url
  // FIRST so signature fields in the loop below can consider them as
  // already-supplied when checking the required flag. (Fixed order:
  // earlier draft threw 'required field missing' on signature fields
  // before these branches ran.)
  let signerName = null;
  if (obj.signer_name !== undefined && obj.signer_name !== null) {
    if (typeof obj.signer_name !== 'string') {
      const err = new TypeError('signer_name must be a string when provided');
      err.code = 'invalid_signer_name';
      throw err;
    }
    const trimmed = obj.signer_name.trim();
    if (trimmed.length > MAX_SIGNER_NAME_LENGTH) {
      const err = new RangeError(`signer_name must be ≤${MAX_SIGNER_NAME_LENGTH} chars`);
      err.code = 'signer_name_too_long';
      throw err;
    }
    signerName = trimmed.length > 0 ? trimmed : null;
  }

  let signatureDataUrl = null;
  if (obj.signature_data_url !== undefined && obj.signature_data_url !== null) {
    if (typeof obj.signature_data_url !== 'string') {
      const err = new TypeError('signature_data_url must be a string when provided');
      err.code = 'invalid_signature_format';
      throw err;
    }
    if (obj.signature_data_url.length > 0) {
      if (obj.signature_data_url.length > MAX_SIGNATURE_DATA_URL_BYTES) {
        const err = new RangeError('signature_data_url exceeds size limit');
        err.code = 'signature_too_large';
        throw err;
      }
      if (!SIGNATURE_DATA_URL_RE.test(obj.signature_data_url)) {
        const err = new RangeError('signature_data_url must be a PNG/JPEG data URL');
        err.code = 'invalid_signature_format';
        throw err;
      }
      signatureDataUrl = obj.signature_data_url;
    }
  }

  /** @type {Record<string, unknown>} */
  const out = {};
  const fieldByName = new Map();
  for (const f of templateFields) {
    if (f && typeof f.name === 'string' && f.name.length > 0) {
      fieldByName.set(f.name, f);
    }
  }

  // Pass 1 — copy known fields, validate types/lengths. Signature fields
  // are a special case: required check is satisfied by EITHER a per-field
  // value OR the top-level signature_data_url parsed above.
  for (const [name, field] of fieldByName.entries()) {
    const provided = Object.prototype.hasOwnProperty.call(incoming, name)
      ? incoming[name]
      : undefined;

    if (field.type === 'signature') {
      // Per-field signature data URL is rare in v1 (the signature pad
      // usually emits the top-level field), but supported for templates
      // with multiple signature fields under different roles.
      if (typeof provided === 'string' && provided.length > 0) {
        if (provided.length > MAX_SIGNATURE_DATA_URL_BYTES) {
          const err = new RangeError(`signature for "${name}" exceeds size limit`);
          err.code = 'signature_too_large';
          throw err;
        }
        if (!SIGNATURE_DATA_URL_RE.test(provided)) {
          const err = new RangeError(`signature for "${name}" must be a PNG/JPEG data URL`);
          err.code = 'invalid_signature_format';
          throw err;
        }
        out[name] = provided;
      }
      // Required check happens after the loop (cross-checks both sources).
      continue;
    }

    if (field.required && (provided === undefined || provided === null || provided === '')) {
      const err = new RangeError(`required field "${name}" is missing`);
      err.code = 'required_field_missing';
      throw err;
    }
    if (provided === undefined) continue;

    if (field.type === 'checkbox') {
      out[name] = !!provided;
      continue;
    }

    if (typeof provided !== 'string' && typeof provided !== 'number') {
      const err = new TypeError(`field "${name}" must be a string or number`);
      err.code = 'invalid_field_type';
      throw err;
    }
    const str = String(provided);
    if (str.length > MAX_FIELD_VALUE_STRING_LENGTH) {
      const err = new RangeError(`field "${name}" exceeds ${MAX_FIELD_VALUE_STRING_LENGTH} chars`);
      err.code = 'field_too_long';
      throw err;
    }
    out[name] = str;
  }

  // Cross-check: a template with at least one required signature field
  // must see a signature value somewhere — either the top-level URL or
  // any per-field value captured above. Same template ALSO requires a
  // signer_name so day 5's pdf-lib stamp can attribute the signature.
  const hasRequiredSignature = templateFields.some(
    (f) => f && f.type === 'signature' && f.required,
  );
  if (hasRequiredSignature) {
    const hasAnySig =
      !!signatureDataUrl ||
      templateFields
        .filter((f) => f.type === 'signature')
        .some((f) => typeof out[f.name] === 'string' && out[f.name].length > 0);
    if (!hasAnySig) {
      const err = new RangeError('a signature is required to submit this document');
      err.code = 'signature_required';
      throw err;
    }
    if (!signerName) {
      const err = new RangeError('a signer name is required to submit this document');
      err.code = 'signer_name_required';
      throw err;
    }
  }

  return {
    field_values: out,
    signature_data_url: signatureDataUrl,
    signer_name: signerName,
  };
}

/**
 * Has this signing session expired by wall-clock?
 *
 * @param {string|Date|null|undefined} expiresAt
 * @param {Date} [now]
 * @returns {boolean}
 */
export function isExpired(expiresAt, now = new Date()) {
  if (!expiresAt) return false;
  const t = expiresAt instanceof Date ? expiresAt.getTime() : Date.parse(String(expiresAt));
  if (!Number.isFinite(t)) return false;
  return t < now.getTime();
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export default function createPublicSignRoutes() {
  const router = express.Router();

  // --- GET /api/sign/:token -----------------------------------------------
  // Returns the session + template + tenant branding + a signed URL for the
  // source PDF. Stamps viewed_at on first view.
  router.get('/:token', async (req, res) => {
    const { token } = req.params;
    if (!isValidSigningToken(token)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const supabase = getSupabaseAdmin();
    const { data: session, error: lookupErr } = await supabase
      .from('signing_sessions')
      .select(
        'id, tenant_id, template_id, related_to, related_id, recipient_email, recipient_name, status, message, audit, expires_at, viewed_at, signed_at, completed_at, declined_at',
      )
      .eq('signing_token', token)
      .maybeSingle();
    if (lookupErr) {
      logger.error('[PublicSign] Session lookup failed', { message: lookupErr.message });
      return res.status(500).json({ error: 'lookup_failed' });
    }
    if (!session) {
      return res.status(404).json({ error: 'not_found' });
    }

    // Status check — terminal states block reads; expired transitions
    // out-of-band.
    if (isExpired(session.expires_at)) {
      // Best-effort transition pending→expired so the row reflects truth.
      // Fire-and-forget; we don't block the response on it.
      if (session.status !== 'expired') {
        supabase
          .from('signing_sessions')
          .update({ status: 'expired' })
          .eq('id', session.id)
          .then(() => undefined, () => undefined);
      }
      return res.status(410).json({ error: 'expired', status: 'expired' });
    }
    if (session.status === 'declined') {
      return res.status(410).json({ error: 'declined', status: 'declined' });
    }
    if (session.status === 'completed' || session.status === 'signed') {
      // Allow the page to render in read-only mode for the recipient (so
      // they can review what they submitted), but mark the response.
      // Day 4's UI flips into a "you've already signed" view.
    }

    // Load template + tenant branding in parallel.
    const [tplRes, tenantRes] = await Promise.all([
      supabase
        .from('signing_templates')
        .select('id, name, fields, pdf_storage_path, archived_at')
        .eq('id', session.template_id)
        .maybeSingle(),
      supabase
        .from('tenant')
        .select('id, tenant_id, name, branding_settings, metadata')
        .eq('id', session.tenant_id)
        .maybeSingle(),
    ]);

    if (tplRes.error || !tplRes.data) {
      logger.error('[PublicSign] Template lookup failed', {
        sessionId: session.id,
        message: tplRes.error?.message,
      });
      return res.status(500).json({ error: 'template_lookup_failed' });
    }
    if (tenantRes.error || !tenantRes.data) {
      logger.error('[PublicSign] Tenant lookup failed', {
        sessionId: session.id,
        message: tenantRes.error?.message,
      });
      return res.status(500).json({ error: 'tenant_lookup_failed' });
    }

    // Mint a 5-min signed URL for the source PDF — pdfjs in the renderer
    // fetches this directly. Same TTL as /api/templates/:id/pdf-url.
    const bucket = getBucketName();
    const ttlSeconds = 300;
    const { data: signed, error: signErr } = await supabase.storage
      .from(bucket)
      .createSignedUrl(tplRes.data.pdf_storage_path, ttlSeconds);
    if (signErr || !signed?.signedUrl) {
      logger.error('[PublicSign] Sign URL failed', {
        sessionId: session.id,
        message: signErr?.message,
      });
      return res.status(503).json({ error: 'sign_failed' });
    }

    // Stamp viewed_at + append audit entry on first view. Subsequent views
    // re-stamp viewed_at (last view wins, which is the more useful semantic
    // for tracking active recipients) and append a new audit entry.
    const auditEntry = makeAuditEntry({
      action: 'viewed',
      ip: extractClientIp(req),
      ua: extractClientUa(req),
    });
    const newAudit = appendAudit(session.audit, auditEntry);
    const newStatus = session.status === 'pending' ? 'viewed' : session.status;
    await supabase
      .from('signing_sessions')
      .update({
        viewed_at: new Date().toISOString(),
        status: newStatus,
        audit: newAudit,
      })
      .eq('id', session.id);

    // Best-effort timeline activity update — non-fatal.
    updateActivityForView({
      supabase,
      tenantId: session.tenant_id,
      signingSessionId: session.id,
    }).catch(() => undefined);

    // Branding payload — frontend renders the public sign page in tenant
    // colors with the tenant logo.
    const branding = {
      tenant_name: tenantRes.data.name || tenantRes.data.tenant_id || null,
      logo_url:
        tenantRes.data.branding_settings?.logo_url ??
        tenantRes.data.metadata?.logo_url ??
        null,
      primary_color: tenantRes.data.branding_settings?.primary_color || null,
    };

    return res.json({
      data: {
        session_id: session.id,
        status: newStatus,
        template: {
          id: tplRes.data.id,
          name: tplRes.data.name,
          fields: tplRes.data.fields || [],
        },
        pdf_url: signed.signedUrl,
        recipient_email: session.recipient_email,
        recipient_name: session.recipient_name,
        message: session.message,
        expires_at: session.expires_at,
        signed_at: session.signed_at,
        completed_at: session.completed_at,
        declined_at: session.declined_at,
        branding,
      },
    });
  });

  // --- POST /api/sign/:token/submit ---------------------------------------
  // Persists field_values + signature, transitions to 'signed'. PDF
  // stamping happens on day 5; until then the row records intent and the
  // recipient sees a "thanks, your signature has been recorded" page.
  router.post('/:token/submit', async (req, res) => {
    const { token } = req.params;
    if (!isValidSigningToken(token)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const supabase = getSupabaseAdmin();
    const { data: session, error: lookupErr } = await supabase
      .from('signing_sessions')
      .select(
        'id, tenant_id, template_id, status, audit, expires_at',
      )
      .eq('signing_token', token)
      .maybeSingle();
    if (lookupErr) {
      logger.error('[PublicSign] Submit lookup failed', { message: lookupErr.message });
      return res.status(500).json({ error: 'lookup_failed' });
    }
    if (!session) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (isExpired(session.expires_at)) {
      return res.status(410).json({ error: 'expired' });
    }
    if (TERMINAL_STATUSES.has(session.status)) {
      return res.status(409).json({ error: 'already_finalized', status: session.status });
    }

    // Reload template fields fresh (operator may have edited them after
    // the session was created — we still validate against current).
    const { data: tpl, error: tplErr } = await supabase
      .from('signing_templates')
      .select('fields')
      .eq('id', session.template_id)
      .maybeSingle();
    if (tplErr || !tpl) {
      return res.status(500).json({ error: 'template_lookup_failed' });
    }

    let parsed;
    try {
      parsed = validateSubmitInput(req.body, Array.isArray(tpl.fields) ? tpl.fields : []);
    } catch (err) {
      return res.status(400).json({
        error: err.code || 'invalid_body',
        message: err.message,
      });
    }

    // Stash signature + signer name on field_values under reserved keys
    // so day 5's pdf-lib stamper has a single place to read them. The
    // schema already accepts arbitrary jsonb on field_values; the
    // leading-underscore prefix avoids collisions with template-defined
    // names.
    const persistedValues = { ...parsed.field_values };
    if (parsed.signature_data_url) {
      persistedValues._signature_data_url = parsed.signature_data_url;
    }
    if (parsed.signer_name) {
      persistedValues._signer_name = parsed.signer_name;
    }

    const auditEntry = makeAuditEntry({
      action: 'signed',
      ip: extractClientIp(req),
      ua: extractClientUa(req),
    });
    if (parsed.signer_name) auditEntry.signer_name = parsed.signer_name;
    const newAudit = appendAudit(session.audit, auditEntry);
    const nowIso = new Date().toISOString();

    const { data, error: updateErr } = await supabase
      .from('signing_sessions')
      .update({
        field_values: persistedValues,
        status: 'signed',
        signed_at: nowIso,
        audit: newAudit,
      })
      .eq('id', session.id)
      .eq('signing_token', token) // belt-and-suspenders against race
      .select('id, status, signed_at')
      .maybeSingle();
    if (updateErr || !data) {
      logger.error('[PublicSign] Submit update failed', {
        sessionId: session.id,
        message: updateErr?.message,
      });
      return res.status(500).json({ error: 'update_failed' });
    }

    // Best-effort timeline activity transition — non-fatal.
    updateActivityForSign({
      supabase,
      tenantId: session.tenant_id,
      signingSessionId: session.id,
      signerName: parsed.signer_name || undefined,
    }).catch(() => undefined);

    // Day 5: finalize the signing session — load original PDF, stamp
    // recipient's responses, append Certificate of Completion, hash,
    // upload to Supabase Storage, transition status to 'completed'.
    // Best-effort write-behind: we've already returned status='signed'
    // to the recipient (legal intent-to-sign is preserved in the row),
    // so a finalize failure doesn't break the recipient's UX. The
    // operator-side "View signed PDF" link will simply 404 until a
    // re-run succeeds.
    //
    // We DON'T await here — the recipient already got their success
    // page. pdf-lib + storage upload can run for a couple of seconds
    // and we don't want to extend the recipient's submit latency.
    finalizeSigningSession({
      supabase,
      bucket: getBucketName(),
      sessionId: session.id,
      signerName: parsed.signer_name || undefined,
    })
      .then((result) => {
        if (!result.ok) {
          logger.warn('[PublicSign] finalize step did not complete', {
            sessionId: session.id,
            reason: result.reason,
          });
        }
      })
      .catch((err) => {
        logger.error('[PublicSign] finalize threw', {
          sessionId: session.id,
          message: err?.message,
        });
      });

    return res.json({ data });
  });

  // --- POST /api/sign/:token/decline --------------------------------------
  router.post('/:token/decline', async (req, res) => {
    const { token } = req.params;
    if (!isValidSigningToken(token)) {
      return res.status(404).json({ error: 'not_found' });
    }

    const supabase = getSupabaseAdmin();
    const { data: session, error: lookupErr } = await supabase
      .from('signing_sessions')
      .select('id, tenant_id, status, audit, expires_at')
      .eq('signing_token', token)
      .maybeSingle();
    if (lookupErr) {
      logger.error('[PublicSign] Decline lookup failed', { message: lookupErr.message });
      return res.status(500).json({ error: 'lookup_failed' });
    }
    if (!session) {
      return res.status(404).json({ error: 'not_found' });
    }
    if (isExpired(session.expires_at)) {
      return res.status(410).json({ error: 'expired' });
    }
    if (TERMINAL_STATUSES.has(session.status)) {
      return res.status(409).json({ error: 'already_finalized', status: session.status });
    }

    let reason = null;
    if (req.body && typeof req.body.reason === 'string') {
      reason = req.body.reason.trim().slice(0, MAX_DECLINE_REASON_LENGTH);
      if (reason.length === 0) reason = null;
    }

    const auditEntry = makeAuditEntry({
      action: 'declined',
      ip: extractClientIp(req),
      ua: extractClientUa(req),
      reason: reason || undefined,
    });
    const newAudit = appendAudit(session.audit, auditEntry);
    const nowIso = new Date().toISOString();

    const { data, error: updateErr } = await supabase
      .from('signing_sessions')
      .update({
        status: 'declined',
        declined_at: nowIso,
        audit: newAudit,
      })
      .eq('id', session.id)
      .eq('signing_token', token)
      .select('id, status, declined_at')
      .maybeSingle();
    if (updateErr || !data) {
      logger.error('[PublicSign] Decline update failed', {
        sessionId: session.id,
        message: updateErr?.message,
      });
      return res.status(500).json({ error: 'update_failed' });
    }

    // Best-effort timeline activity transition — non-fatal.
    updateActivityForDecline({
      supabase,
      tenantId: session.tenant_id,
      signingSessionId: session.id,
      reason: reason || undefined,
    }).catch(() => undefined);

    return res.json({ data });
  });

  return router;
}
